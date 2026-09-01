import React from 'react'
import { useAppStore } from '@/store'
import { resolveWorktreeIdByPath } from '../../../../../shared/todo/resolve-worktree-id-by-path'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

export function useTaskReviewWorktreeId(item: TodoItem): string | null {
  const meta = useAppStore((s) => s.activeSessionMetaByTask[item.id])
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)

  return React.useMemo(() => {
    const map = new Map<string, { worktreeId: string; path: string }[]>()
    for (const [repoId, worktrees] of Object.entries(worktreesByRepo)) {
      map.set(
        repoId,
        worktrees.map((worktree) => ({ worktreeId: worktree.id, path: worktree.path }))
      )
    }
    return resolveWorktreeIdByPath(meta?.cwd, map)
  }, [meta?.cwd, worktreesByRepo])
}
