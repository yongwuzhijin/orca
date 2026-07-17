import type { AcpEngine } from '../acp/acp-session'
import type { TodoPriority } from './todo-priority'
import type { TodoStatus } from './todo-status'

export type TodoItem = {
  id: string
  identifier: string
  projectId: string
  title: string
  description: string
  status: TodoStatus
  priority: TodoPriority
  scheduledDate: string | null
  estimate: number | null
  labels: string[]
  templateId: string | null
  /** Orca Project id bound for workspace creation when the task starts. */
  workspaceProjectId: string | null
  /** Optional worktree/workspace name hint for later creation. */
  workspaceName: string | null
  /** Preferred ACP engine when entering in-progress. */
  preferredAgent: AcpEngine | null
  orderKey: string
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  sessionId: string | null
  /** Whether this task participates in autonomous orchestrator pickup. Default false. */
  autoPilotEnabled: boolean
  /** Per-task continuation turn cap; null falls back to the global default. */
  autoPilotMaxTurns: number | null
}

export type CreateTodoItemInput = {
  projectId: string
  title: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  scheduledDate?: string | null
  estimate?: number | null
  labels?: string[]
  templateId?: string | null
  workspaceProjectId?: string | null
  workspaceName?: string | null
  preferredAgent?: AcpEngine | null
  autoPilotEnabled?: boolean
  autoPilotMaxTurns?: number | null
}

export type UpdateTodoItemPatch = {
  title?: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  scheduledDate?: string | null
  estimate?: number | null
  labels?: string[]
  templateId?: string | null
  workspaceProjectId?: string | null
  workspaceName?: string | null
  preferredAgent?: AcpEngine | null
  autoPilotEnabled?: boolean
  autoPilotMaxTurns?: number | null
}
