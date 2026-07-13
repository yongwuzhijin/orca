import type { UsageWorktreeRef } from '../usage-worktree-metadata'

function normalizePath(p: string): string {
  const unified = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? unified.toLowerCase() : unified
}

export function resolveWorktreeIdByPath(
  cwd: string | null | undefined,
  worktreesByRepo: Map<string, UsageWorktreeRef[]>
): string | null {
  if (!cwd) {
    return null
  }
  const target = normalizePath(cwd)
  let best: { worktreeId: string; len: number } | null = null
  for (const list of worktreesByRepo.values()) {
    for (const ref of list) {
      const base = normalizePath(ref.path)
      if (target === base || target.startsWith(`${base}/`)) {
        if (!best || base.length > best.len) {
          best = { worktreeId: ref.worktreeId, len: base.length }
        }
      }
    }
  }
  return best ? best.worktreeId : null
}
