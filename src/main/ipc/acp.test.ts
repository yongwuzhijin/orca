import { describe, it, expect, vi } from 'vitest'
import { registerAcpHandlers } from './acp'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>()
  return {
    ipcMain: {
      handle: (ch: string, fn: (e: unknown, arg: unknown) => unknown) => handlers.set(ch, fn)
    },
    invoke: (ch: string, arg: unknown) => handlers.get(ch)!({}, arg),
    handlers
  }
}

describe('registerAcpHandlers', () => {
  it('acp:execute delegates to executeRouter', async () => {
    const f = fakeIpc()
    const executeEnginePrompt = vi.fn().mockResolvedValue({ sessionId: 's1' })
    registerAcpHandlers(
      {
        executeRouter: { executeEnginePrompt } as never,
        sessionManager: {
          cancelSession: vi.fn(),
          listSessions: vi.fn(),
          loadHistory: vi.fn()
        } as never,
        permissionBridge: { resolvePermission: vi.fn() } as never
      },
      f.ipcMain as never
    )
    const res = await f.invoke('acp:execute', {
      taskId: 't',
      engine: 'claude',
      prompt: 'x',
      cwd: '/tmp'
    })
    expect(executeEnginePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't', engine: 'claude' })
    )
    expect(res).toEqual({ sessionId: 's1' })
  })

  it('acp:cancel / list-sessions / load-history / resolve-permission wire through', async () => {
    const f = fakeIpc()
    const sessionManager = {
      cancelSession: vi.fn().mockResolvedValue({ ok: true }),
      listSessions: vi.fn().mockReturnValue([{ id: 'a' }]),
      loadHistory: vi.fn()
    }
    const permissionBridge = { resolvePermission: vi.fn().mockReturnValue(true) }
    registerAcpHandlers(
      {
        executeRouter: { executeEnginePrompt: vi.fn() } as never,
        sessionManager: sessionManager as never,
        permissionBridge: permissionBridge as never
      },
      f.ipcMain as never
    )
    expect(await f.invoke('acp:cancel', { sessionId: 's1' })).toEqual({ ok: true })
    expect(await f.invoke('acp:list-sessions', { taskId: 't' })).toEqual([{ id: 'a' }])
    await f.invoke('acp:load-history', { sessionId: 's1' })
    expect(sessionManager.loadHistory).toHaveBeenCalledWith('s1')
    expect(
      await f.invoke('acp:resolve-permission', { requestId: 'r1', optionId: 'allow' })
    ).toEqual({ ok: true })
  })
})
