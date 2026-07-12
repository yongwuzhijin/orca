import { ipcMain as defaultIpcMain } from 'electron'
import type { WorkspacePort } from '../../shared/workspace-ports'

export type TodoReviewHandlerDeps = {
  scanReviewPorts: (taskId: string) => Promise<WorkspacePort[]>
}

type IpcMainLike = {
  handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void
}

export function registerTodoReviewHandlers(
  deps: TodoReviewHandlerDeps,
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('todos:review.scanPorts', (_e, arg: { taskId: string }) =>
    deps.scanReviewPorts(arg.taskId)
  )
}
