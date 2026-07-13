import type { TaskGitFacts } from '../../shared/todo/todo-merge'

export type MergeGitExec = (argv: string[]) => Promise<{ stdout: string }>

async function tryStdout(runGit: MergeGitExec, argv: string[]): Promise<string | null> {
  try {
    const { stdout } = await runGit(argv)
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function localBranchExists(runGit: MergeGitExec, name: string): Promise<boolean> {
  try {
    await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

// Reduce a ref candidate (e.g. "origin/main", "refs/remotes/origin/main",
// "refs/heads/main") to its bare branch name ("main").
function toBranchName(ref: string): string {
  const stripped = ref.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/[^/]+\//, '')
  const slash = stripped.lastIndexOf('/')
  return slash >= 0 ? stripped.slice(slash + 1) : stripped
}

async function resolveTargetBranch(
  runGit: MergeGitExec,
  sourceBranch: string
): Promise<string | null> {
  const candidates: string[] = []
  const configured = await tryStdout(runGit, ['config', '--get', `branch.${sourceBranch}.base`])
  if (configured) {
    candidates.push(configured)
  }
  const originHead = await tryStdout(runGit, [
    'symbolic-ref',
    '--short',
    'refs/remotes/origin/HEAD'
  ])
  if (originHead) {
    candidates.push(originHead)
  }
  candidates.push('main', 'master')

  for (const candidate of candidates) {
    const name = toBranchName(candidate)
    if (!name || name === sourceBranch) {
      continue
    }
    if (await localBranchExists(runGit, name)) {
      return name
    }
  }
  return null
}

// Resolve the git facts a merge plan needs, from a runGit already bound to the task cwd.
export async function resolveTaskGitFacts(deps: { runGit: MergeGitExec }): Promise<TaskGitFacts> {
  const repoRoot = await tryStdout(deps.runGit, ['rev-parse', '--show-toplevel'])
  if (!repoRoot) {
    return { repoRoot: null, sourceBranch: null, targetBranch: null }
  }
  const head = await tryStdout(deps.runGit, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const sourceBranch = head && head !== 'HEAD' ? head : null
  if (!sourceBranch) {
    return { repoRoot, sourceBranch: null, targetBranch: null }
  }
  const targetBranch = await resolveTargetBranch(deps.runGit, sourceBranch)
  return { repoRoot, sourceBranch, targetBranch }
}
