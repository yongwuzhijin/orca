import type { TodoItem } from '../../shared/todo/todo-item'
import type { TodoPriority } from '../../shared/todo/todo-priority'
import type { TodoProject } from '../../shared/todo/todo-project'
import type { TodoStatus } from '../../shared/todo/todo-status'
import type { TodoTemplate } from '../../shared/todo/todo-template'
import { isAcpEngine } from '../../shared/acp/acp-session'

// Snake_case shapes mirror the SQLite columns in todo-database.ts so the raw
// prepared-statement rows map to domain entities without implicit casing magic.
export type TodoProjectRow = {
  id: string
  name: string
  identifier_prefix: string
  next_sequence: number
  default_working_dir: string | null
  created_at: string
  updated_at: string
}

export type TodoTemplateRow = {
  id: string
  name: string
  body: string
  created_at: string
  updated_at: string
}

export type TodoItemRow = {
  id: string
  identifier: string
  project_id: string
  title: string
  description: string
  status: string
  priority: string
  scheduled_date: string | null
  estimate: number | null
  labels: string
  template_id: string | null
  order_key: string
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  session_id: string | null
  workspace_project_id: string | null
  workspace_name: string | null
  preferred_agent: string | null
  auto_pilot_enabled: number
  auto_pilot_max_turns: number | null
}

export function rowToProject(row: TodoProjectRow): TodoProject {
  return {
    id: row.id,
    name: row.name,
    identifierPrefix: row.identifier_prefix,
    nextSequence: row.next_sequence,
    defaultWorkingDir: row.default_working_dir,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToTemplate(row: TodoTemplateRow): TodoTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// Why: labels is stored as a JSON text column; corrupt/legacy values must not
// crash the board, so parse errors and non-string entries fall back to [].
export function parseLabels(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

export function rowToTodoItem(row: TodoItemRow): TodoItem {
  return {
    id: row.id,
    identifier: row.identifier,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status as TodoStatus,
    priority: row.priority as TodoPriority,
    scheduledDate: row.scheduled_date,
    estimate: row.estimate,
    labels: parseLabels(row.labels),
    templateId: row.template_id,
    orderKey: row.order_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    sessionId: row.session_id,
    workspaceProjectId: row.workspace_project_id,
    workspaceName: row.workspace_name,
    preferredAgent:
      row.preferred_agent && isAcpEngine(row.preferred_agent) ? row.preferred_agent : null,
    autoPilotEnabled: row.auto_pilot_enabled === 1,
    autoPilotMaxTurns: row.auto_pilot_max_turns
  }
}
