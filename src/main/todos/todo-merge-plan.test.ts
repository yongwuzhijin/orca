import { describe, it, expect } from 'vitest'
import { resolveTaskMergePlan } from './todo-merge-plan'
import type { TaskGitFacts } from '../../shared/todo/todo-merge'

const facts = (over: Partial<TaskGitFacts>): TaskGitFacts => ({
  repoRoot: '/repo',
  sourceBranch: 'feature-x',
  targetBranch: 'main',
  ...over
})

describe('resolveTaskMergePlan', () => {
  it('ok when source != target and both resolved', () => {
    const p = resolveTaskMergePlan('t1', facts({}))
    expect(p).toEqual({
      taskId: 't1',
      applicable: true,
      reason: 'ok',
      repoRoot: '/repo',
      sourceBranch: 'feature-x',
      targetBranch: 'main'
    })
  })

  it('not-a-repo when repoRoot is null', () => {
    const p = resolveTaskMergePlan(
      't1',
      facts({ repoRoot: null, sourceBranch: null, targetBranch: null })
    )
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('not-a-repo')
  })

  it('detached-head when sourceBranch is null but repo exists', () => {
    const p = resolveTaskMergePlan('t1', facts({ sourceBranch: null }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('detached-head')
  })

  it('no-base when targetBranch is null', () => {
    const p = resolveTaskMergePlan('t1', facts({ targetBranch: null }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('no-base')
  })

  it('already-on-base when source == target', () => {
    const p = resolveTaskMergePlan('t1', facts({ sourceBranch: 'main', targetBranch: 'main' }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('already-on-base')
  })
})
