export type TodoStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'rework'
  | 'human_review'
  | 'merging'
  | 'done'
  | 'canceled'
  | 'duplicate'

export const TODO_STATUSES: readonly TodoStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'rework',
  'human_review',
  'merging',
  'done',
  'canceled',
  'duplicate'
] as const

export const TERMINAL_TODO_STATUSES: readonly TodoStatus[] = [
  'done',
  'canceled',
  'duplicate'
] as const

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (TODO_STATUSES as readonly string[]).includes(value)
}

export function isTerminalTodoStatus(status: TodoStatus): boolean {
  return (TERMINAL_TODO_STATUSES as readonly string[]).includes(status)
}
