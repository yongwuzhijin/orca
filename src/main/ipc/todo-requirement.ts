import { ipcMain as defaultIpcMain } from 'electron'
import {
  initRequirementWorktree,
  readClarificationState,
  writeClarificationState
} from '../todos/todo-requirement-worktree-service'
import type { ClarificationState } from '../../shared/todo/todo-clarification-template'

export type InitRequirementWorktreeArgs = {
  worktreePath: string
  todoId: string
  title: string
  prdLink?: string | null
}

type IpcMainLike = {
  handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void
}

export function registerTodoRequirementHandlers(
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('todos:requirement.initWorktree', (_e, arg: InitRequirementWorktreeArgs) => {
    initRequirementWorktree(arg)
  })
  ipcMain.handle('todos:requirement.readClarification', (_e, arg: { worktreePath: string }) =>
    readClarificationState(arg.worktreePath)
  )
  ipcMain.handle(
    'todos:requirement.writeClarification',
    (_e, arg: { worktreePath: string; state: ClarificationState }) => {
      writeClarificationState(arg.worktreePath, arg.state)
    }
  )
}
