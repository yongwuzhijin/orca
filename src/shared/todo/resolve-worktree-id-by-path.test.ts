import { describe, expect, it } from 'vitest'
import { resolveWorktreeIdByPath } from './resolve-worktree-id-by-path'

function refs(rows: [string, string][]): Map<string, { worktreeId: string; path: string }[]> {
  return new Map(rows.map(([worktreeId, path]) => ['repo', [{ worktreeId, path }]]))
}

describe('resolveWorktreeIdByPath', () => {
  it('returns null for empty cwd', () => {
    expect(resolveWorktreeIdByPath(null, refs([['w1', '/repo']]))).toBeNull()
  })

  it('matches exact and nested paths', () => {
    expect(resolveWorktreeIdByPath('/repo/wt', refs([['w1', '/repo/wt']]))).toBe('w1')
    expect(resolveWorktreeIdByPath('/repo/wt/src', refs([['w1', '/repo/wt']]))).toBe('w1')
  })
})
