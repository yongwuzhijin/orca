import { ipcMain as defaultIpcMain } from 'electron'
import type { StartPromptOptions } from '../../shared/acp/acp-session'

type ExecuteRouterLike = {
  executeEnginePrompt: (opts: StartPromptOptions) => Promise<{ sessionId: string }>
}
type SessionManagerLike = {
  cancelSession: (sessionId: string) => Promise<{ ok: boolean }>
  listSessions: (taskId: string) => unknown[]
  loadHistory: (sessionId: string) => void
}
type PermissionBridgeLike = {
  resolvePermission: (requestId: string, optionId: string) => boolean
}

export type AcpHandlerDeps = {
  executeRouter: ExecuteRouterLike
  sessionManager: SessionManagerLike
  permissionBridge: PermissionBridgeLike
}

type IpcMainLike = {
  handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void
}

export function registerAcpHandlers(
  deps: AcpHandlerDeps,
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('acp:execute', (_e, arg: StartPromptOptions) =>
    deps.executeRouter.executeEnginePrompt(arg)
  )
  ipcMain.handle('acp:cancel', (_e, arg: { sessionId: string }) =>
    deps.sessionManager.cancelSession(arg.sessionId)
  )
  ipcMain.handle('acp:resolve-permission', (_e, arg: { requestId: string; optionId: string }) => ({
    ok: deps.permissionBridge.resolvePermission(arg.requestId, arg.optionId)
  }))
  ipcMain.handle('acp:list-sessions', (_e, arg: { taskId: string }) =>
    deps.sessionManager.listSessions(arg.taskId)
  )
  ipcMain.handle('acp:load-history', (_e, arg: { sessionId: string }) => {
    deps.sessionManager.loadHistory(arg.sessionId)
  })
}
