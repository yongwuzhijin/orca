import { partitionRequirementWorktrees } from '../../../../../../shared/todo/todo-requirement-worktrees'
import type { Worktree } from '../../../../../../shared/worktree/types'

export function partitionRepoRequirementWorktrees(
  items: readonly Worktree[],
  activeBoundIds: ReadonlySet<string>
): { requirement: Worktree[]; rest: Worktree[] } {
  return partitionRequirementWorktrees(items, activeBoundIds)
}
