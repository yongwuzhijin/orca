import type { TodoItem } from '../../shared/todo/todo-item'
import { TODO_PRIORITIES } from '../../shared/todo/todo-priority'

// Why: TODO_PRIORITIES is ['none','low','medium','high','urgent']; urgent is the
// most pressing, so higher index must sort first (rank = negative index).
function priorityRank(item: TodoItem): number {
  return -TODO_PRIORITIES.indexOf(item.priority)
}

// Mirrors Symphony §8.2 candidate ordering, minus the blocking gate (orca has no
// task-dependency model). Pure + non-mutating (spreads before sort).
export function sortAutoPilotCandidates(items: readonly TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    const byPriority = priorityRank(a) - priorityRank(b)
    if (byPriority !== 0) {
      return byPriority
    }
    if (a.orderKey !== b.orderKey) {
      return a.orderKey < b.orderKey ? -1 : 1
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1
    }
    return 0
  })
}
