import type { MergeOutcome, MergePlan } from '../../shared/todo/todo-merge'

export type MergeRunGit = (argv: string[]) => Promise<{ stdout: string; stderr: string }>

async function unmergedFiles(runGit: MergeRunGit): Promise<string[]> {
  try {
    const { stdout } = await runGit(['diff', '--name-only', '--diff-filter=U'])
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function safeRun(runGit: MergeRunGit, argv: string[]): Promise<void> {
  try {
    await runGit(argv)
  } catch {
    // best-effort recovery; ignore
  }
}

function describeError(e: unknown): string {
  if (e instanceof Error) {
    return e.message
  }
  return String(e)
}

// Execute a local branch merge for a task. Requires an applicable, source≠target plan.
export async function executeTaskMerge(deps: {
  runGit: MergeRunGit
  plan: MergePlan
}): Promise<MergeOutcome> {
  const { runGit, plan } = deps
  const source = plan.sourceBranch as string
  const target = plan.targetBranch as string

  const rollback = async (): Promise<void> => {
    await safeRun(runGit, ['merge', '--abort'])
    await safeRun(runGit, ['checkout', source])
  }

  try {
    await runGit(['checkout', target])
  } catch (e) {
    await rollback()
    return { outcome: 'error', message: describeError(e) }
  }

  // Try fast-forward first.
  try {
    await runGit(['merge', '--ff-only', source])
    await safeRun(runGit, ['branch', '-d', source])
    return { outcome: 'merged', strategy: 'fast-forward', deletedBranch: source }
  } catch {
    // fall through to --no-ff
  }

  // ff not possible: attempt a real merge commit.
  try {
    await runGit([
      'merge',
      '--no-ff',
      '-m',
      `Merge ${source} into ${target} (orca task ${plan.taskId})`,
      source
    ])
    await safeRun(runGit, ['branch', '-d', source])
    return { outcome: 'merged', strategy: 'merge-commit', deletedBranch: source }
  } catch (e) {
    const conflicts = await unmergedFiles(runGit)
    await rollback()
    if (conflicts.length > 0) {
      return { outcome: 'conflict', conflictFiles: conflicts }
    }
    return { outcome: 'error', message: describeError(e) }
  }
}
