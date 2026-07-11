import { BrowserWindow } from 'electron'

type WindowLike = {
  isDestroyed: () => boolean
  webContents: { send: (channel: string, payload: unknown) => void }
}

type WindowSource = () => WindowLike[]

const defaultWindowSource: WindowSource = () =>
  BrowserWindow.getAllWindows() as unknown as WindowLike[]

// Why: orca has no emitToRenderer; broadcast to all live windows like star-nag/service.ts.
// scopeId lets the renderer subscribe to a per-session/per-task channel in addition to the base.
export function broadcastAcpEvent(
  channel: string,
  payload: unknown,
  scopeId?: string,
  windowSource: WindowSource = defaultWindowSource
): void {
  const channels = scopeId ? [channel, `${channel}:${scopeId}`] : [channel]
  for (const win of windowSource()) {
    if (win.isDestroyed()) {
      continue
    }
    for (const ch of channels) {
      win.webContents.send(ch, payload)
    }
  }
}
