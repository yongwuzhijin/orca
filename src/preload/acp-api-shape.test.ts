import { describe, it, expect, vi } from 'vitest'
import { createAcpApi } from './acp-api'

describe('createAcpApi', () => {
  it('invoke methods call ipcRenderer.invoke with the right channels', async () => {
    const invoke = vi.fn().mockResolvedValue({ sessionId: 's1' })
    const on = vi.fn()
    const removeListener = vi.fn()
    const api = createAcpApi({ invoke, on, removeListener } as never)
    await api.execute({ taskId: 't', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    expect(invoke).toHaveBeenCalledWith('acp:execute', {
      taskId: 't',
      engine: 'claude',
      prompt: 'x',
      cwd: '/tmp'
    })
    await api.cancel({ sessionId: 's1' })
    expect(invoke).toHaveBeenCalledWith('acp:cancel', { sessionId: 's1' })
  })

  it('event subscriptions register a listener and return a cleanup that removes it', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const removeListener = vi.fn()
    const api = createAcpApi({ invoke, on, removeListener } as never)
    const cb = vi.fn()
    const cleanup = api.onComplete('s1', cb)
    expect(on).toHaveBeenCalledWith('acp:complete:s1', expect.any(Function))
    cleanup()
    expect(removeListener).toHaveBeenCalledWith('acp:complete:s1', expect.any(Function))
  })
})
