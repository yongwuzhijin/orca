export const DEFAULT_TODO_PROJECT_ID = 'todo-default'
export const DEFAULT_TODO_PROJECT_NAME = 'Default'
export const DEFAULT_TODO_PROJECT_PREFIX = 'TODO'

/** Active project is always the built-in default; switching is not supported. */
export function resolveLockedTodoActiveProjectId(): string {
  return DEFAULT_TODO_PROJECT_ID
}
