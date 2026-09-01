import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import type { CreateTodoItemInput } from '../../shared/todo/todo-item'
import { DEFAULT_TODO_PROJECT_ID } from '../../shared/todo/todo-default-project'
import { orderKeyBetween } from '../../shared/todo/order-key'
import {
  normalizeWorkspaceProjectIds,
  primaryWorkspaceProjectId
} from '../../shared/todo/workspace-project-ids'
import { isTerminalTodoStatus, type TodoStatus } from '../../shared/todo/todo-status'
import { ensureDefaultTodoProject } from './todo-project-store'
import type { TodoProjectRow } from './todo-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

// startedAt/completedAt are derived from status, not set directly by callers:
// completedAt tracks the first (and only, until reopened) terminal entry;
// startedAt is a one-way stamp set when work first enters in_progress.
export function deriveTodoItemTimestamps(
  newStatus: TodoStatus,
  previousStartedAt: string | null,
  previousCompletedAt: string | null,
  timestamp: string
): { startedAt: string | null; completedAt: string | null } {
  const completedAt = isTerminalTodoStatus(newStatus) ? (previousCompletedAt ?? timestamp) : null
  const startedAt = previousStartedAt ?? (newStatus === 'in_progress' ? timestamp : null)
  return { startedAt, completedAt }
}

// Returns the new item id; callers re-read the row to get the mapped entity.
export function insertTodoItem(db: Database.Database, input: CreateTodoItemInput): string {
  // Why: UI locks creates to todo-default; ensure here so create still works
  // if listProjects never ran (e.g. main/renderer skew after HMR).
  if (input.projectId === DEFAULT_TODO_PROJECT_ID) {
    ensureDefaultTodoProject(db)
  }
  const timestamp = nowIso()
  const id = randomUUID()
  const status: TodoStatus = input.status ?? 'todo'
  const priority = input.priority ?? 'none'
  const description = input.description ?? ''
  const labels = input.labels ?? []
  const scheduledDate = input.scheduledDate ?? null
  const estimate = input.estimate ?? null
  const templateId = input.templateId ?? null
  const workspaceProjectIds = normalizeWorkspaceProjectIds(
    input.workspaceProjectIds,
    input.workspaceProjectId ?? null
  )
  const workspaceProjectId = primaryWorkspaceProjectId(
    workspaceProjectIds,
    input.workspaceProjectId ?? null
  )
  const workspaceName = input.workspaceName?.trim() ? input.workspaceName.trim() : null
  const prdLink = input.prdLink?.trim() ? input.prdLink.trim() : null
  const preferredAgent = input.preferredAgent ?? null
  const executionMode = input.executionMode ?? null
  const autoPilotEnabled = input.autoPilotEnabled ?? false
  const autoPilotMaxTurns = input.autoPilotMaxTurns ?? null
  const designStageEnabled = input.designStageEnabled ?? false
  const boundWorktreeId = input.boundWorktreeId?.trim() ? input.boundWorktreeId.trim() : null
  const { startedAt, completedAt } = deriveTodoItemTimestamps(status, null, null, timestamp)

  db.exec('BEGIN')
  try {
    const project = db.prepare('SELECT * FROM todo_projects WHERE id = ?').get(input.projectId) as
      | TodoProjectRow
      | undefined
    if (!project) {
      throw new Error(`TodoRepository: project not found: ${input.projectId}`)
    }
    const sequence = project.next_sequence
    const identifier = `${project.identifier_prefix}-${sequence}`

    db.prepare('UPDATE todo_projects SET next_sequence = ?, updated_at = ? WHERE id = ?').run(
      sequence + 1,
      timestamp,
      input.projectId
    )

    // Append to the tail of the target column: place after the current max
    // order_key among same-project + same-status items.
    const tail = db
      .prepare(
        'SELECT MAX(order_key) AS max_key FROM todo_items WHERE project_id = ? AND status = ?'
      )
      .get(input.projectId, status) as { max_key: string | null } | undefined
    const orderKey = orderKeyBetween(tail?.max_key ?? null, null)

    db.prepare(
      `INSERT INTO todo_items (
        id, identifier, project_id, title, description, status, priority,
        scheduled_date, estimate, labels, template_id, order_key,
        created_at, updated_at, started_at, completed_at, session_id,
        workspace_project_id, workspace_project_ids, workspace_name, preferred_agent, auto_pilot_enabled, auto_pilot_max_turns,
        design_stage_enabled, prd_link, execution_mode, bound_worktree_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      JSON.stringify(workspaceProjectIds),
      workspaceName,
      preferredAgent,
      autoPilotEnabled ? 1 : 0,
      autoPilotMaxTurns,
      designStageEnabled ? 1 : 0,
      prdLink,
      executionMode,
      boundWorktreeId
    )

    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  return id
}
