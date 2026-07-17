import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import type {
  CreateTodoItemInput,
  TodoItem,
  UpdateTodoItemPatch
} from '../../shared/todo/todo-item'
import type {
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  TodoProject,
  UpdateTodoProjectInput
} from '../../shared/todo/todo-project'
import { isTerminalTodoStatus, type TodoStatus } from '../../shared/todo/todo-status'
import type {
  CreateTodoTemplateInput,
  TodoTemplate,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'
import { orderKeyBetween } from '../../shared/todo/order-key'
import type { TodoDatabase } from './todo-database'
import {
  createTodoProject,
  deleteTodoProject,
  ensureDefaultTodoProject,
  listTodoProjects,
  renameTodoProject,
  updateTodoProject
} from './todo-project-store'
import { DEFAULT_TODO_PROJECT_ID } from '../../shared/todo/todo-default-project'
import {
  rowToTemplate,
  rowToTodoItem,
  type TodoItemRow,
  type TodoProjectRow,
  type TodoTemplateRow
} from './todo-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

// startedAt/completedAt are derived from status, not set directly by callers:
// completedAt tracks the first (and only, until reopened) terminal entry;
// startedAt is a one-way stamp set when work first enters in_progress.
function deriveTimestamps(
  newStatus: TodoStatus,
  previousStartedAt: string | null,
  previousCompletedAt: string | null,
  timestamp: string
): { startedAt: string | null; completedAt: string | null } {
  const completedAt = isTerminalTodoStatus(newStatus) ? (previousCompletedAt ?? timestamp) : null
  const startedAt = previousStartedAt ?? (newStatus === 'in_progress' ? timestamp : null)
  return { startedAt, completedAt }
}

export class TodoRepository {
  private readonly db: Database.Database

  constructor(database: TodoDatabase) {
    this.db = database.raw
  }

  // --- Projects ---

  ensureDefaultProject(): TodoProject {
    return ensureDefaultTodoProject(this.db)
  }

  listProjects(): TodoProject[] {
    return listTodoProjects(this.db)
  }

  createProject(input: CreateTodoProjectInput): TodoProject {
    return createTodoProject(this.db, input)
  }

  renameProject(input: RenameTodoProjectInput): TodoProject {
    return renameTodoProject(this.db, input)
  }

  updateProject(input: UpdateTodoProjectInput): TodoProject {
    return updateTodoProject(this.db, input)
  }

  deleteProject(id: string): void {
    deleteTodoProject(this.db, id)
  }

  // --- Templates ---

  listTemplates(): TodoTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM todo_templates ORDER BY created_at ASC')
      .all() as TodoTemplateRow[]
    return rows.map(rowToTemplate)
  }

  createTemplate(input: CreateTodoTemplateInput): TodoTemplate {
    const timestamp = nowIso()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO todo_templates (id, name, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, input.name, input.body, timestamp, timestamp)
    return this.requireTemplate(id)
  }

  updateTemplate(input: UpdateTodoTemplateInput): TodoTemplate {
    const current = this.requireTemplate(input.id)
    const name = input.name ?? current.name
    const body = input.body ?? current.body
    this.db
      .prepare('UPDATE todo_templates SET name = ?, body = ?, updated_at = ? WHERE id = ?')
      .run(name, body, nowIso(), input.id)
    return this.requireTemplate(input.id)
  }

  deleteTemplate(id: string): void {
    this.db.prepare('DELETE FROM todo_templates WHERE id = ?').run(id)
  }

  private requireTemplate(id: string): TodoTemplate {
    const row = this.db.prepare('SELECT * FROM todo_templates WHERE id = ?').get(id) as
      | TodoTemplateRow
      | undefined
    if (!row) {
      throw new Error(`TodoRepository: template not found: ${id}`)
    }
    return rowToTemplate(row)
  }

  // --- Items ---

  listItems(projectId: string): TodoItem[] {
    const rows = this.db
      .prepare('SELECT * FROM todo_items WHERE project_id = ? ORDER BY order_key ASC')
      .all(projectId) as TodoItemRow[]
    return rows.map(rowToTodoItem)
  }

  // Why: the orchestrator picks across all projects — status must be 'todo'
  // (backlog is not ready) and eligible. order_key is only a stable secondary;
  // the service applies the full priority sort.
  listAutoPilotCandidates(): TodoItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM todo_items WHERE status = 'todo' AND auto_pilot_enabled = 1 ORDER BY order_key ASC`
      )
      .all() as TodoItemRow[]
    return rows.map(rowToTodoItem)
  }

  getItem(id: string): TodoItem | null {
    const row = this.db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as
      | TodoItemRow
      | undefined
    return row ? rowToTodoItem(row) : null
  }

  createItem(input: CreateTodoItemInput): TodoItem {
    // Why: UI locks creates to todo-default; ensure here so create still works
    // if listProjects never ran (e.g. main/renderer skew after HMR).
    if (input.projectId === DEFAULT_TODO_PROJECT_ID) {
      ensureDefaultTodoProject(this.db)
    }
    const timestamp = nowIso()
    const id = randomUUID()
    const status: TodoStatus = input.status ?? 'backlog'
    const priority = input.priority ?? 'none'
    const description = input.description ?? ''
    const labels = input.labels ?? []
    const scheduledDate = input.scheduledDate ?? null
    const estimate = input.estimate ?? null
    const templateId = input.templateId ?? null
    const workspaceProjectId = input.workspaceProjectId ?? null
    const workspaceName = input.workspaceName?.trim() ? input.workspaceName.trim() : null
    const preferredAgent = input.preferredAgent ?? null
    const autoPilotEnabled = input.autoPilotEnabled ?? false
    const autoPilotMaxTurns = input.autoPilotMaxTurns ?? null
    const { startedAt, completedAt } = deriveTimestamps(status, null, null, timestamp)

    this.db.exec('BEGIN')
    try {
      const project = this.db
        .prepare('SELECT * FROM todo_projects WHERE id = ?')
        .get(input.projectId) as TodoProjectRow | undefined
      if (!project) {
        throw new Error(`TodoRepository: project not found: ${input.projectId}`)
      }
      const sequence = project.next_sequence
      const identifier = `${project.identifier_prefix}-${sequence}`

      this.db
        .prepare('UPDATE todo_projects SET next_sequence = ?, updated_at = ? WHERE id = ?')
        .run(sequence + 1, timestamp, input.projectId)

      // Append to the tail of the target column: place after the current max
      // order_key among same-project + same-status items.
      const tail = this.db
        .prepare(
          'SELECT MAX(order_key) AS max_key FROM todo_items WHERE project_id = ? AND status = ?'
        )
        .get(input.projectId, status) as { max_key: string | null } | undefined
      const orderKey = orderKeyBetween(tail?.max_key ?? null, null)

      this.db
        .prepare(
          `INSERT INTO todo_items (
            id, identifier, project_id, title, description, status, priority,
            scheduled_date, estimate, labels, template_id, order_key,
            created_at, updated_at, started_at, completed_at, session_id,
            workspace_project_id, workspace_name, preferred_agent, auto_pilot_enabled, auto_pilot_max_turns
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          identifier,
          input.projectId,
          input.title,
          description,
          status,
          priority,
          scheduledDate,
          estimate,
          JSON.stringify(labels),
          templateId,
          orderKey,
          timestamp,
          timestamp,
          startedAt,
          completedAt,
          // New items start with no ACP session; setSessionId links one later.
          null,
          workspaceProjectId,
          workspaceName,
          preferredAgent,
          autoPilotEnabled ? 1 : 0,
          autoPilotMaxTurns
        )

      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }

    return this.requireItem(id)
  }

  updateItem(id: string, patch: UpdateTodoItemPatch): TodoItem {
    const current = this.requireItem(id)
    const timestamp = nowIso()

    const title = patch.title ?? current.title
    const description = patch.description ?? current.description
    const priority = patch.priority ?? current.priority
    const scheduledDate =
      patch.scheduledDate !== undefined ? patch.scheduledDate : current.scheduledDate
    const estimate = patch.estimate !== undefined ? patch.estimate : current.estimate
    const templateId = patch.templateId !== undefined ? patch.templateId : current.templateId
    const labels = patch.labels ?? current.labels
    const status = patch.status ?? current.status
    const workspaceProjectId =
      patch.workspaceProjectId !== undefined ? patch.workspaceProjectId : current.workspaceProjectId
    const workspaceName =
      patch.workspaceName !== undefined
        ? patch.workspaceName?.trim()
          ? patch.workspaceName.trim()
          : null
        : current.workspaceName
    const preferredAgent =
      patch.preferredAgent !== undefined ? patch.preferredAgent : current.preferredAgent
    const autoPilotEnabled =
      patch.autoPilotEnabled !== undefined ? patch.autoPilotEnabled : current.autoPilotEnabled
    const autoPilotMaxTurns =
      patch.autoPilotMaxTurns !== undefined ? patch.autoPilotMaxTurns : current.autoPilotMaxTurns

    // Only re-derive lifecycle stamps when the status actually changes; a plain
    // field edit must not disturb startedAt/completedAt.
    const timestamps =
      patch.status !== undefined
        ? deriveTimestamps(status, current.startedAt, current.completedAt, timestamp)
        : { startedAt: current.startedAt, completedAt: current.completedAt }

    this.db
      .prepare(
        `UPDATE todo_items SET
          title = ?, description = ?, status = ?, priority = ?,
          scheduled_date = ?, estimate = ?, labels = ?, template_id = ?,
          workspace_project_id = ?, workspace_name = ?, preferred_agent = ?,
          auto_pilot_enabled = ?, auto_pilot_max_turns = ?,
          updated_at = ?, started_at = ?, completed_at = ?
        WHERE id = ?`
      )
      .run(
        title,
        description,
        status,
        priority,
        scheduledDate,
        estimate,
        JSON.stringify(labels),
        templateId,
        workspaceProjectId,
        workspaceName,
        preferredAgent,
        autoPilotEnabled ? 1 : 0,
        autoPilotMaxTurns,
        timestamp,
        timestamps.startedAt,
        timestamps.completedAt,
        id
      )

    return this.requireItem(id)
  }

  moveItem(id: string, status: TodoStatus, orderKey: string): TodoItem {
    const current = this.requireItem(id)
    const timestamp = nowIso()
    const timestamps = deriveTimestamps(status, current.startedAt, current.completedAt, timestamp)

    this.db
      .prepare(
        `UPDATE todo_items SET
          status = ?, order_key = ?, updated_at = ?, started_at = ?, completed_at = ?
        WHERE id = ?`
      )
      .run(status, orderKey, timestamp, timestamps.startedAt, timestamps.completedAt, id)

    return this.requireItem(id)
  }

  // session_id is managed separately from updateItem so a plain field edit never
  // clears the pointer to a running ACP session.
  setSessionId(id: string, sessionId: string | null): TodoItem {
    this.db
      .prepare('UPDATE todo_items SET session_id = ?, updated_at = ? WHERE id = ?')
      .run(sessionId, nowIso(), id)
    return this.requireItem(id)
  }

  deleteItem(id: string): void {
    this.db.prepare('DELETE FROM todo_items WHERE id = ?').run(id)
  }

  private requireItem(id: string): TodoItem {
    const item = this.getItem(id)
    if (!item) {
      throw new Error(`TodoRepository: item not found: ${id}`)
    }
    return item
  }
}
