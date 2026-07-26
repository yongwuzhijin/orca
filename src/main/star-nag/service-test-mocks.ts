import { vi } from 'vitest'

// Why: this module must not import './service' — vi.mock factories load it while
// the harness (which imports the service) is still evaluating, so any service
// dependency here would deadlock the module graph.

export type TestWindow = {
  isDestroyed: () => boolean
  webContents: { send: ReturnType<typeof vi.fn> }
}

export const appMock = {
  getVersion: vi.fn(() => '1.2.3')
}

export const browserWindowMock = {
  getAllWindows: vi.fn<() => TestWindow[]>(() => [])
}

// Why: exported vi.fn() needs explicit signatures — TS can't name the inferred
// @vitest/spy types across module boundaries (TS2883).
export const checkOrcaStarredMock = vi.fn<() => Promise<boolean | null>>()
export const starOrcaMock = vi.fn<() => Promise<boolean>>()
export const trackMock = vi.fn<(event: string, props?: Record<string, unknown>) => void>()
export const getCohortAtEmitMock = vi.fn(() => ({ nth_repo_added: 3 }))
export const ipcMainHandleMock = vi.fn<(channel: string, handler: unknown) => void>()

export function resetStarNagServiceMocks(): void {
  appMock.getVersion.mockReset()
  appMock.getVersion.mockReturnValue('1.2.3')
  browserWindowMock.getAllWindows.mockReset()
  browserWindowMock.getAllWindows.mockReturnValue([])
  checkOrcaStarredMock.mockReset()
  checkOrcaStarredMock.mockResolvedValue(false)
  starOrcaMock.mockReset()
  starOrcaMock.mockResolvedValue(true)
  trackMock.mockReset()
  getCohortAtEmitMock.mockReset()
  getCohortAtEmitMock.mockReturnValue({ nth_repo_added: 3 })
  ipcMainHandleMock.mockReset()
}

export function createWindow(): TestWindow {
  return {
    isDestroyed: () => false,
    webContents: {
      send: vi.fn()
    }
  }
}

type IpcHandler = () => unknown

export function getIpcHandler(channel: string): IpcHandler {
  const call = ipcMainHandleMock.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!call) {
    throw new Error(`missing IPC handler for ${channel}`)
  }
  return call[1] as IpcHandler
}

export function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

export async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}
