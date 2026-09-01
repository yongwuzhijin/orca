import type { TodoPriority } from './todo-priority'
import type { TodoStatus } from './todo-status'
import type { TodoExecutionMode } from './todo-execution-mode'

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
  /** All Orca projects selected at task creation; primary is workspaceProjectId. */
  workspaceProjectIds: string[]
  /** Optional worktree/workspace name hint for later creation. */
  workspaceName: string | null
  /** PRD document URL captured at requirement creation. */
  prdLink: string | null
  /** How the task was started: ACP session or terminal agent. */
  executionMode: TodoExecutionMode | null
  /** Agent/engine id chosen at start; meaning depends on executionMode. */
  preferredAgent: string | null
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
  /** Whether starting this task routes it through the solution_design stage. Default false. */
  designStageEnabled: boolean
  /** Worktree created when the task started; drives sidebar requirements list. */
  boundWorktreeId: string | null
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
  workspaceProjectIds?: string[]
  workspaceName?: string | null
  prdLink?: string | null
  executionMode?: TodoExecutionMode | null
  preferredAgent?: string | null
  autoPilotEnabled?: boolean
  autoPilotMaxTurns?: number | null
  designStageEnabled?: boolean
  boundWorktreeId?: string | null
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
  workspaceProjectIds?: string[]
  workspaceName?: string | null
  prdLink?: string | null
  executionMode?: TodoExecutionMode | null
  preferredAgent?: string | null
  autoPilotEnabled?: boolean
  autoPilotMaxTurns?: number | null
  designStageEnabled?: boolean
  boundWorktreeId?: string | null
}
