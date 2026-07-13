import { describe, it, expect } from 'vitest'
import { executeTaskMerge } from './todo-merge-executor'
import type { MergePlan } from '../../shared/todo/todo-merge'

const plan: MergePlan = {
  taskId: 't1',
  applicable: true,
  reason: 'ok',
  repoRoot: '/repo',
  sourceBranch: 'feature-x',
  targetBranch: 'main'
}

// Record calls; behavior configured per join(' ') key.
function makeRunGit(behavior: Record<string, () => { stdout?: string; stderr?: string }>) {
  const calls: string[] = []
  const runGit = async (argv: string[]): Promise<{ stdout: string; stderr: string }> => {
    const key = argv.join(' ')
    calls.push(key)
    const fn = behavior[key]
    if (!fn) {
      return { stdout: '', stderr: '' }
    }
    const r = fn()
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  return { runGit, calls }
}

describe('executeTaskMerge', () => {
  it('fast-forward path: checkout target, ff-only merge, delete source', async () => {
    const { runGit, calls } = makeRunGit({})
    const res = await executeTaskMerge({ runGit, plan })
    expect(res).toEqual({ outcome: 'merged', strategy: 'fast-forward', deletedBranch: 'feature-x' })
    expect(calls).toContain('checkout main')
    expect(calls).toContain('merge --ff-only feature-x')
    expect(calls).toContain('branch -d feature-x')
  })

  it('merge-commit path: ff-only fails (non-conflict), --no-ff succeeds', async () => {
    let ffTried = false
    const { runGit, calls } = makeRunGit({
      'merge --ff-only feature-x': () => {
        ffTried = true
        throw new Error('Not possible to fast-forward, aborting.')
      }
      // --no-ff merge + branch -d fall through to the default success stub
    })
    const res = await executeTaskMerge({ runGit, plan })
    expect(ffTried).toBe(true)
    expect(res).toEqual({ outcome: 'merged', strategy: 'merge-commit', deletedBranch: 'feature-x' })
    expect(calls).toContain('merge --no-ff -m Merge feature-x into main (orca task t1) feature-x')
    expect(calls).toContain('branch -d feature-x')
  })

  it('conflict path: merge fails with unmerged files -> abort + restore + conflict', async () => {
    const { runGit, calls } = makeRunGit({
      'merge --ff-only feature-x': () => {
        throw new Error('fast-forward not possible')
      },
      'merge --no-ff -m Merge feature-x into main (orca task t1) feature-x': () => {
        throw new Error('Automatic merge failed; fix conflicts')
      },
      'diff --name-only --diff-filter=U': () => ({ stdout: 'src/a.ts\nsrc/b.ts\n' })
    })
    const res = await executeTaskMerge({ runGit, plan })
    expect(res).toEqual({ outcome: 'conflict', conflictFiles: ['src/a.ts', 'src/b.ts'] })
    expect(calls).toContain('merge --abort')
    expect(calls).toContain('checkout feature-x')
  })

  it('error path: checkout target fails, no unmerged files -> error', async () => {
    const { runGit } = makeRunGit({
      'checkout main': () => {
        throw new Error('cannot checkout: local changes')
      },
      'diff --name-only --diff-filter=U': () => ({ stdout: '' })
    })
    const res = await executeTaskMerge({ runGit, plan })
    expect(res.outcome).toBe('error')
    if (res.outcome === 'error') {
      expect(res.message).toMatch(/checkout/i)
    }
  })
})
