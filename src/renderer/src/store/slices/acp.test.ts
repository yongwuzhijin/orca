import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAcpSlice, type AcpSlice } from './acp'

function makeStore() {
  let state: AcpSlice
  const set = (partial: Partial<AcpSlice> | ((s: AcpSlice) => Partial<AcpSlice>)) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }
  const get = (): AcpSlice => state
  state = createAcpSlice(set as never, get as never, {} as never)
  return { get, set }
}

const listeners: Record<string, ((p: unknown) => void)[]> = {}
function emit(channel: string, sid: string, payload: unknown) {
  for (const cb of listeners[`${channel}:${sid}`] ?? []) {
    cb(payload)
  }
}

beforeEach(() => {
  for (const k of Object.keys(listeners)) {
    delete listeners[k]
  }
  ;(globalThis as { window?: unknown }).window = {
    api: {
      acp: {
        execute: vi.fn(async () => ({ sessionId: 's1' })),
        cancel: vi.fn(async () => ({ ok: true })),
        listSessions: vi.fn(async () => []),
        loadHistory: vi.fn(),
        resolvePermission: vi.fn(async () => ({ ok: true })),
        setPermissionMode: vi.fn(async () => ({ ok: true })),
        onSessionUpdate: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:session-update:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onUpdate: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:update:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onComplete: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:complete:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onError: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:error:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onPermissionRequest: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:permission-request:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onSessionReady: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:session-ready:${sid}`] ??= []).push(cb)
          return () => {}
        }
      }
    }
  }
})

describe('acp slice', () => {
  it('executeTask stores sessionId as active and subscribes', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    expect(get().activeSessionByTask.t1).toBe('s1')
  })

  it('live session-update appends normalized event', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:session-update', 's1', {
      sessionId: 's1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hey' } }
    })
    expect(get().eventsBySession.s1).toEqual([{ kind: 'agent_message', text: 'hey' }])
  })

  it('plan update writes planBySession', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:session-update', 's1', {
      sessionId: 's1',
      update: { sessionUpdate: 'plan', entries: [{ content: 'a', status: 'pending' }] }
    })
    expect(get().planBySession.s1).toEqual([{ content: 'a', status: 'pending' }])
  })

  it('permission-request adds pending request', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:permission-request', 's1', {
      requestId: 'r1',
      sessionId: 's1',
      params: {
        options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
        toolCall: { toolCallId: 'tc', title: 't' }
      }
    })
    expect(get().permissionRequestsBySession.s1?.[0]?.requestId).toBe('r1')
  })

  it('complete sets session status and clears pending permissions', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:complete', 's1', { sessionId: 's1', stopReason: 'end_turn' })
    expect(get().sessionStatusBySession.s1).toBe('complete')
  })

  it('resolvePermission removes the request and calls IPC', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:permission-request', 's1', {
      requestId: 'r1',
      sessionId: 's1',
      params: {
        options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
        toolCall: { toolCallId: 'tc', title: 't' }
      }
    })
    await get().resolvePermission('s1', 'r1', 'allow-once')
    expect(window.api.acp.resolvePermission).toHaveBeenCalledWith({
      requestId: 'r1',
      optionId: 'allow-once'
    })
    expect(get().permissionRequestsBySession.s1).toEqual([])
  })

  it('setPermissionMode updates state and calls IPC', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    await get().setPermissionMode('s1', 'ask')
    expect(get().permissionModeBySession.s1).toBe('ask')
    expect(window.api.acp.setPermissionMode).toHaveBeenCalledWith({ sessionId: 's1', mode: 'ask' })
  })
})
