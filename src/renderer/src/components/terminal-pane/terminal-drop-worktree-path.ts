import { useAppStore } from '@/store'
import { isTerminalDropWindowsPathLike } from './terminal-drop-shell'

export function resolveTerminalDropWorktreePath(
  worktreeId: string,
  fallbackCwd: string | undefined
): string | null {
  const state = useAppStore.getState()
  const allWorktrees = Object.values(state.worktreesByRepo ?? {}).flat()
  const worktree = allWorktrees.find((w) => w.id === worktreeId)
  return worktree?.path ?? fallbackCwd ?? null
}

export function joinRuntimeTerminalDropDir(worktreePath: string, orcaDirName: string): string {
  const trimmed = worktreePath.replace(/[\\/]+$/, '')
  if (isTerminalDropWindowsPathLike(worktreePath)) {
    return `${trimmed.replace(/\//g, '\\')}\\${orcaDirName.replace(/\//g, '\\')}\\drops`
  }
  return `${trimmed}/${orcaDirName}/drops`
}
