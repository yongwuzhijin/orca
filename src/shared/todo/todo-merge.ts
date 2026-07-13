// P4a: shared shapes for task merge preview/execute across main, preload, renderer.

export type MergePlanReason =
  | 'ok' // applicable: 源≠目标且能合并
  | 'no-session' // task 无关联 ACP session / cwd
  | 'not-a-repo' // cwd 不在 git 仓库
  | 'detached-head' // 源为游离 HEAD,无分支名
  | 'already-on-base' // 源 == 目标,无需合并
  | 'no-base' // 找不到本地基准分支

export type TaskGitFacts = {
  repoRoot: string | null
  sourceBranch: string | null // null = detached / not-a-repo
  targetBranch: string | null // 本地基准分支名; null = 无
}

export type MergePlan = {
  taskId: string
  applicable: boolean
  reason: MergePlanReason
  repoRoot: string | null
  sourceBranch: string | null
  targetBranch: string | null
}

export type MergeOutcome =
  | { outcome: 'merged'; strategy: 'fast-forward' | 'merge-commit'; deletedBranch: string | null }
  | { outcome: 'conflict'; conflictFiles: string[] }
  | { outcome: 'error'; message: string }
