// src/main/acp/acp-connection-pool.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AcpConnectionPool, type ConnectResult } from './acp-connection-pool'
import type { AcpEngine } from '../../shared/acp/acp-session'

function fakeConnection() {
  return {
    initialize: vi.fn().mockResolvedValue({ protocolVersion: 1, agentCapabilities: {} }),
    newSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn()
  }
}

describe('AcpConnectionPool', () => {
  it('reuses a single connection per engine', async () => {
    const connect = vi.fn().mockImplementation(() => {
      const conn = fakeConnection()
      return { connection: conn, onExit: () => {}, dispose: () => {} }
    })
    const pool = new AcpConnectionPool({ connect })
    const a = await pool.getAcpConnection('claude')
    const b = await pool.getAcpConnection('claude')
    expect(a).toBe(b)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('caches session updates and replays them (cap enforced)', () => {
    const pool = new AcpConnectionPool({ connect: vi.fn() })
    for (let i = 0; i < 3005; i++) {
      pool.recordSessionUpdate('claude', 'sess-1', { sessionId: 'sess-1', update: { i } } as never)
    }
    const seen: unknown[] = []
    pool.replaySessionEvents('sess-1', (n) => seen.push(n))
    expect(seen.length).toBe(3000) // cap
    expect((seen.at(-1) as { update: { i: number } }).update.i).toBe(3004)
  })

  it('closeAcpConnection disposes and drops the cached entry', async () => {
    const dispose = vi.fn()
    const connect = vi
      .fn()
      .mockReturnValue({ connection: fakeConnection(), onExit: () => {}, dispose })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('qoder')
    pool.closeAcpConnection('qoder')
    expect(dispose).toHaveBeenCalledTimes(1)
    await pool.getAcpConnection('qoder')
    expect(connect).toHaveBeenCalledTimes(2) // re-spawned
  })
})

function makeConnect(initResult: unknown) {
  const authenticate = vi.fn(async () => ({}))
  const initialize = vi.fn(async () => initResult)
  const connect = (_engine: AcpEngine): ConnectResult => ({
    connection: {
      initialize,
      authenticate,
      newSession: vi.fn(),
      resumeSession: vi.fn(),
      loadSession: vi.fn(),
      prompt: vi.fn(),
      cancel: vi.fn()
    } as never,
    onExit: () => {},
    dispose: () => {}
  })
  return { connect, authenticate, initialize }
}

describe('cursor authenticate handshake (P2b)', () => {
  it('authenticates cursor when authMethods include cursor_login', async () => {
    const { connect, authenticate } = makeConnect({ authMethods: [{ id: 'cursor_login' }] })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('cursor')
    expect(authenticate).toHaveBeenCalledWith({ methodId: 'cursor_login' })
  })

  it('skips authenticate when cursor_login absent', async () => {
    const { connect, authenticate } = makeConnect({ authMethods: [] })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('cursor')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('never authenticates claude (zero regression)', async () => {
    const { connect, authenticate } = makeConnect({ authMethods: [{ id: 'cursor_login' }] })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('claude')
    expect(authenticate).not.toHaveBeenCalled()
  })
})
