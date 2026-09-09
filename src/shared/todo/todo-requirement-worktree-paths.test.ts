import { describe, expect, it } from 'vitest'
import {
  DMONWORK_WORKTREE_DIR,
  joinRequirementPrdPath,
  joinRequirementWorktreeRoot
} from './todo-requirement-worktree-paths'

describe('todo-requirement-worktree-paths', () => {
  it('joins worktree root and prd path on posix', () => {
    expect(joinRequirementWorktreeRoot('/repo/feat')).toBe(`/repo/feat/${DMONWORK_WORKTREE_DIR}`)
    expect(joinRequirementPrdPath('/repo/feat')).toBe(`/repo/feat/${DMONWORK_WORKTREE_DIR}/prd.md`)
  })

  it('joins worktree root on windows paths', () => {
    expect(joinRequirementWorktreeRoot('C:\\repo\\feat')).toBe(
      `C:\\repo\\feat\\${DMONWORK_WORKTREE_DIR}`
    )
  })
})
