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
import type { TodoStatus } from '../../shared/todo/todo-status'
import type {
  CreateTodoTemplateInput,
  TodoTemplate,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'
import type {
  CreateTodoClarificationTemplateInput,
  TodoClarificationTemplate,
  UpdateTodoClarificationTemplateInput
} from '../../shared/todo/todo-clarification-template'
import type { TodoDatabase } from './todo-database'
import {
  createTodoClarificationTemplate,
  deleteTodoClarificationTemplate,
  listTodoClarificationTemplates,
  updateTodoClarificationTemplate
} from './todo-clarification-template-store'
import {
  createTodoProject,
  deleteTodoProject,
  ensureDefaultTodoProject,
  listTodoProjects,
  renameTodoProject,
  updateTodoProject
} from './todo-project-store'
import {
  createTodoTemplate,
  deleteTodoTemplate,
  listTodoTemplates,
  updateTodoTemplate
} from './todo-template-store'
import { deriveTodoItemTimestamps, insertTodoItem } from './todo-item-store'
import {
  normalizeWorkspaceProjectIds,
  primaryWorkspaceProjectId
} from '../../shared/todo/workspace-project-ids'
import { rowToTodoItem, type TodoItemRow } from './todo-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
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
    return listTodoTemplates(this.db)
  }

  createTemplate(input: CreateTodoTemplateInput): TodoTemplate {
    return createTodoTemplate(this.db, input)
  }

  updateTemplate(input: UpdateTodoTemplateInput): TodoTemplate {
    return updateTodoTemplate(this.db, input)
  }

  deleteTemplate(id: string): void {
    deleteTodoTemplate(this.db, id)
  }

  // --- Clarification templates ---

  listClarificationTemplates(): TodoClarificationTemplate[] {
    return listTodoClarificationTemplates(this.db)
  }

  createClarificationTemplate(
    input: CreateTodoClarificationTemplateInput
  ): TodoClarificationTemplate {
    return createTodoClarificationTemplate(this.db, input)
  }

  updateClarificationTemplate(
    input: UpdateTodoClarificationTemplateInput
  ): TodoClarificationTemplate {
    return updateTodoClarificationTemplate(this.db, input)
  }

  deleteClarificationTemplate(id: string): void {
    deleteTodoClarificationTemplate(this.db, id)
  }

  // --- Items ---

  listItems(projectId: string): TodoItem[] {
    const rows = this.db
      .prepare('SELECT * FROM todo_items WHERE project_id = ? ORDER BY order_key ASC')
      .all(projectId) as TodoItemRow[]
    return rows.map(rowToTodoItem)
  }

  // Why: the orchestrator picks across all projects, so no project_id filter here.
  // order_key is only a stable secondary; the service applies the full priority sort.
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
    return this.requireItem(insertTodoItem(this.db, input))
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
    const workspaceProjectIds =
      patch.workspaceProjectIds !== undefined || patch.workspaceProjectId !== undefined
        ? normalizeWorkspaceProjectIds(
            patch.workspaceProjectIds ?? current.workspaceProjectIds,
            patch.workspaceProjectId !== undefined
              ? patch.workspaceProjectId
              : current.workspaceProjectId
          )
        : current.workspaceProjectIds
    const workspaceProjectId = primaryWorkspaceProjectId(
      workspaceProjectIds,
      patch.workspaceProjectId !== undefined ? patch.workspaceProjectId : current.workspaceProjectId
    )
    const workspaceName =
      patch.workspaceName !== undefined
        ? patch.workspaceName?.trim()
          ? patch.workspaceName.trim()
          : null
        : current.workspaceName
    const prdLink =
      patch.prdLink !== undefined
        ? patch.prdLink?.trim()
          ? patch.prdLink.trim()
          : null
        : current.prdLink
    const executionMode =
      patch.executionMode !== undefined ? patch.executionMode : current.executionMode
    const preferredAgent =
      patch.preferredAgent !== undefined ? patch.preferredAgent : current.preferredAgent
    const autoPilotEnabled =
      patch.autoPilotEnabled !== undefined ? patch.autoPilotEnabled : current.autoPilotEnabled
    const autoPilotMaxTurns =
      patch.autoPilotMaxTurns !== undefined ? patch.autoPilotMaxTurns : current.autoPilotMaxTurns
    const designStageEnabled =
      patch.designStageEnabled !== undefined ? patch.designStageEnabled : current.designStageEnabled
    const boundWorktreeId =
      patch.boundWorktreeId !== undefined
        ? patch.boundWorktreeId?.trim()
          ? patch.boundWorktreeId.trim()
          : null
        : current.boundWorktreeId

    // Only re-derive lifecycle stamps when the status actually changes; a plain
    // field edit must not disturb startedAt/completedAt.
    const timestamps =
      patch.status !== undefined
        ? deriveTodoItemTimestamps(status, current.startedAt, current.completedAt, timestamp)
        : { startedAt: current.startedAt, completedAt: current.completedAt }

    this.db
      .prepare(
        `UPDATE todo_items SET
          title = ?, description = ?, status = ?, priority = ?,
          scheduled_date = ?, estimate = ?, labels = ?, template_id = ?,
          workspace_project_id = ?, workspace_project_ids = ?, workspace_name = ?, preferred_agent = ?,
          auto_pilot_enabled = ?, auto_pilot_max_turns = ?, design_stage_enabled = ?,
          prd_link = ?, execution_mode = ?, bound_worktree_id = ?,
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
        JSON.stringify(workspaceProjectIds),
        workspaceName,
        preferredAgent,
        autoPilotEnabled ? 1 : 0,
        autoPilotMaxTurns,
        designStageEnabled ? 1 : 0,
        prdLink,
        executionMode,
        boundWorktreeId,
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
    const timestamps = deriveTodoItemTimestamps(
      status,
      current.startedAt,
      current.completedAt,
      timestamp
    )

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
