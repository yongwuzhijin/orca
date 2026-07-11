import type { StartPromptOptions } from '../shared/acp/acp-session'

type IpcRendererLike = {
  invoke: (channel: string, arg?: unknown) => Promise<unknown>
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => void
  removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => void
}

function subscribe(
  ipc: IpcRendererLike,
  channel: string,
  cb: (payload: unknown) => void
): () => void {
  const listener = (_e: unknown, payload: unknown): void => cb(payload)
  ipc.on(channel, listener)
  return () => ipc.removeListener(channel, listener)
}

export function createAcpApi(ipc: IpcRendererLike) {
  return {
    execute: (opts: StartPromptOptions) => ipc.invoke('acp:execute', opts),
    cancel: (arg: { sessionId: string }) => ipc.invoke('acp:cancel', arg),
    resolvePermission: (arg: { requestId: string; optionId: string }) =>
      ipc.invoke('acp:resolve-permission', arg),
    listSessions: (arg: { taskId: string }) => ipc.invoke('acp:list-sessions', arg),
    loadHistory: (arg: { sessionId: string }) => ipc.invoke('acp:load-history', arg),
    onSessionReady: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:session-ready:${sessionId}`, cb),
    onUpdate: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:update:${sessionId}`, cb),
    onComplete: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:complete:${sessionId}`, cb),
    onError: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:error:${sessionId}`, cb),
    onPermissionRequest: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:permission-request:${sessionId}`, cb),
    onTaskOutcome: (taskId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:task-outcome:${taskId}`, cb)
  }
}

export type AcpApi = ReturnType<typeof createAcpApi>
