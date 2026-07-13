import { ipcMain as defaultIpcMain } from 'electron'
import type { MergeOutcome, MergePlan } from '../../shared/todo/todo-merge'
import { resolveTaskGitFacts } from '../todos/todo-merge-git-facts'
import { resolveTaskMergePlan } from '../todos/todo-merge-plan'
import { executeTaskMerge } from '../todos/todo-merge-executor'

export type TodoMergeHandlerDeps = {
  // Latest ACP session cwd for a task, or null when none.
  getTaskCwd: (taskId: string) => string | null
  // Run a git command bound to cwd; must throw on non-zero exit.
  runGitInCwd: (cwd: string, argv: string[]) => Promise<{ stdout: string; stderr: string }>
}

type IpcMainLike = {
  handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void
}

async function buildPlan(deps: TodoMergeHandlerDeps, taskId: string): Promise<MergePlan> {
  const cwd = deps.getTaskCwd(taskId)
  if (!cwd) {
    return {
      taskId,
      applicable: false,
      reason: 'no-session',
      repoRoot: null,
      sourceBranch: null,
      targetBranch: null
    }
  }
  const runGit = (argv: string[]): Promise<{ stdout: string; stderr: string }> =>
    deps.runGitInCwd(cwd, argv)
  const facts = await resolveTaskGitFacts({ runGit })
  return resolveTaskMergePlan(taskId, facts)
}

export function registerTodoMergeHandlers(
  deps: TodoMergeHandlerDeps,
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('todos:merge.preview', (_e, arg: { taskId: string }) =>
    buildPlan(deps, arg.taskId)
  )

  ipcMain.handle(
    'todos:merge.execute',
    async (_e, arg: { taskId: string }): Promise<MergeOutcome> => {
      const plan = await buildPlan(deps, arg.taskId)
      if (!plan.applicable) {
        return { outcome: 'error', message: `merge not applicable: ${plan.reason}` }
      }
      const cwd = deps.getTaskCwd(arg.taskId) as string
      const runGit = (argv: string[]): Promise<{ stdout: string; stderr: string }> =>
        deps.runGitInCwd(cwd, argv)
      return executeTaskMerge({ runGit, plan })
    }
  )
}
