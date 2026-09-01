import type { TodoItem } from './todo-item'
import { isTerminalTodoStatus } from './todo-status'

/** Worktree ids bound to non-terminal requirements — candidates for the sidebar Requirements group. */
export function listActiveBoundWorktreeIds(items: readonly TodoItem[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    if (!item.boundWorktreeId || isTerminalTodoStatus(item.status)) {
      continue
    }
    ids.add(item.boundWorktreeId)
  }
  return ids
}

export function partitionRequirementWorktrees<T extends { id: string }>(
  items: readonly T[],
  activeBoundIds: ReadonlySet<string>
): { requirement: T[]; rest: T[] } {
  if (activeBoundIds.size === 0) {
    return { requirement: [], rest: [...items] }
  }
  const requirement: T[] = []
  const rest: T[] = []
  for (const item of items) {
    if (activeBoundIds.has(item.id)) {
      requirement.push(item)
    } else {
      rest.push(item)
    }
  }
  return { requirement, rest }
}
