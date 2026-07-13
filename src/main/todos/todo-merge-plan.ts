import type { MergePlan, TaskGitFacts } from '../../shared/todo/todo-merge'

// Pure: derive an actionable merge plan from resolved git facts. No I/O.
export function resolveTaskMergePlan(taskId: string, facts: TaskGitFacts): MergePlan {
  const base = {
    taskId,
    repoRoot: facts.repoRoot,
    sourceBranch: facts.sourceBranch,
    targetBranch: facts.targetBranch
  }
  if (!facts.repoRoot) {
    return { ...base, applicable: false, reason: 'not-a-repo' }
  }
  if (!facts.sourceBranch) {
    return { ...base, applicable: false, reason: 'detached-head' }
  }
  if (!facts.targetBranch) {
    return { ...base, applicable: false, reason: 'no-base' }
  }
  if (facts.sourceBranch === facts.targetBranch) {
    return { ...base, applicable: false, reason: 'already-on-base' }
  }
  return { ...base, applicable: true, reason: 'ok' }
}
