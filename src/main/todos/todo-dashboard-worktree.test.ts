import { describe, expect, it } from 'vitest'
import { resolveWorktreeIdByPath } from './todo-dashboard-worktree'
import type { UsageWorktreeRef } from '../usage-worktree-metadata'

function refs(list: [string, string][]): Map<string, UsageWorktreeRef[]> {
  const map = new Map<string, UsageWorktreeRef[]>()
  map.set(
    'repo',
    list.map(([worktreeId, path]) => ({ worktreeId, path, displayName: path }))
  )
  return map
}

describe('resolveWorktreeIdByPath', () => {
  it('returns null for empty cwd', () => {
    expect(resolveWorktreeIdByPath(null, refs([['w1', '/repo']]))).toBeNull()
    expect(resolveWorktreeIdByPath(undefined, refs([['w1', '/repo']]))).toBeNull()
    expect(resolveWorktreeIdByPath('', refs([['w1', '/repo']]))).toBeNull()
  })

  it('matches exact path', () => {
    expect(resolveWorktreeIdByPath('/repo/wt', refs([['w1', '/repo/wt']]))).toBe('w1')
  })

  it('matches a nested cwd under a worktree path', () => {
    expect(resolveWorktreeIdByPath('/repo/wt/src/main', refs([['w1', '/repo/wt']]))).toBe('w1')
  })

  it('prefers the longest matching prefix', () => {
    const map = refs([
      ['root', '/repo'],
      ['nested', '/repo/wt']
    ])
    expect(resolveWorktreeIdByPath('/repo/wt/src', map)).toBe('nested')
  })

  it('does not match a sibling that only shares a string prefix', () => {
    expect(resolveWorktreeIdByPath('/repo/wt-other/src', refs([['w1', '/repo/wt']]))).toBeNull()
  })

  it('returns null when nothing contains the cwd', () => {
    expect(resolveWorktreeIdByPath('/elsewhere', refs([['w1', '/repo/wt']]))).toBeNull()
  })

  it('normalizes trailing slashes and backslashes', () => {
    expect(resolveWorktreeIdByPath('/repo/wt/', refs([['w1', '/repo/wt']]))).toBe('w1')
  })
})
