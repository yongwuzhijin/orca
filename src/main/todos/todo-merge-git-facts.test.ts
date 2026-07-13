import { describe, it, expect } from 'vitest'
import { resolveTaskGitFacts } from './todo-merge-git-facts'

// mock runGit: map of exact "argv.join(' ')" -> stdout, throw if not present
function makeRunGit(map: Record<string, string>) {
  return async (argv: string[]): Promise<{ stdout: string }> => {
    const key = argv.join(' ')
    if (key in map) {
      return { stdout: map[key] }
    }
    throw new Error(`git failed: ${key}`)
  }
}

describe('resolveTaskGitFacts', () => {
  it('resolves repoRoot, source, and target from branch.<n>.base', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feature-x\n',
      'config --get branch.feature-x.base': 'main\n',
      'show-ref --verify --quiet refs/heads/main': ''
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts).toEqual({ repoRoot: '/repo', sourceBranch: 'feature-x', targetBranch: 'main' })
  })

  it('falls back to origin/HEAD when no configured base', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feature-x\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'show-ref --verify --quiet refs/heads/main': ''
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts.targetBranch).toBe('main')
  })

  it('returns not-a-repo facts when show-toplevel fails', async () => {
    const runGit = makeRunGit({})
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts).toEqual({ repoRoot: null, sourceBranch: null, targetBranch: null })
  })

  it('returns detached-head facts when HEAD has no branch name', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'HEAD\n'
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts).toEqual({ repoRoot: '/repo', sourceBranch: null, targetBranch: null })
  })

  it('targetBranch null when candidate local branch does not exist', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feature-x\n',
      'config --get branch.feature-x.base': 'main\n'
      // no show-ref for refs/heads/main -> not a local branch
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts.targetBranch).toBeNull()
  })

  it('does not pick the source branch itself as target', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'show-ref --verify --quiet refs/heads/main': ''
    })
    const facts = await resolveTaskGitFacts({ runGit })
    // source is main and only candidate is main -> no distinct target
    expect(facts.targetBranch).toBeNull()
  })
})
