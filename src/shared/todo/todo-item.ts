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
  orderKey: string
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  sessionId: string | null
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
}
