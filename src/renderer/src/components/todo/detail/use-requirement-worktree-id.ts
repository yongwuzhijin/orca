import type { TodoItem } from '../../../../../shared/todo/todo-item'

export function useRequirementWorktreeId(item: TodoItem): string | null {
  return item.boundWorktreeId
}
