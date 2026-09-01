import { describe, expect, it } from 'vitest'
import { partitionRepoRequirementWorktrees } from './requirement-worktree-partition'
import type { Worktree } from '../../../../../../shared/worktree/types'

function wt(id: string): Worktree {
  return { id } as Worktree
}

describe('partitionRepoRequirementWorktrees', () => {
  it('keeps requirement worktrees ahead of the rest', () => {
    expect(
      partitionRepoRequirementWorktrees([wt('a'), wt('b'), wt('c')], new Set(['c', 'a']))
    ).toEqual({
      requirement: [wt('a'), wt('c')],
      rest: [wt('b')]
    })
  })
})
