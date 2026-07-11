// src/main/acp/acp-session-manager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AcpSessionManager } from './acp-session-manager'

function deps() {
  const connection = {
    newSession: vi
      .fn()
      .mockResolvedValue({
        sessionId: 'eng-sess-1',
        modes: { current: 'default', available: ['default'] },
        models: []
      }),
    resumeSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
    cancel: vi.fn().mockResolvedValue(undefined),
    setSessionMode: vi.fn().mockResolvedValue(undefined)
  }
  const connectionPool = {
    getAcpConnection: vi.fn().mockResolvedValue(connection),
    trackSession: vi.fn(),
    replaySessionEvents: vi.fn(),
    recordSessionUpdate: vi.fn()
  }
  const acpSessions = {
    create: vi
      .fn()
      .mockImplementation((i) => ({ ...i, status: 'running', endedAt: null, stopReason: null })),
    finish: vi.fn(),
    listByTask: vi.fn().mockReturnValue([]),
    getBySessionId: vi.fn()
  }
  const todos = {
    setSessionId: vi.fn(),
    updateItem: vi.fn(),
    getItem: vi.fn().mockReturnValue({ id: 'task-1', status: 'in_progress' })
  }
  const broadcast = vi.fn()
  return { connection, connectionPool, acpSessions, todos, broadcast }
}

function makeManager(d: ReturnType<typeof deps>) {
  return new AcpSessionManager({
    connectionPool: d.connectionPool as never,
    acpSessions: d.acpSessions as never,
    todos: d.todos as never,
    permissionBridge: {
      requestPermission: vi.fn(),
      resolvePermission: vi.fn(),
      rejectAllForSession: vi.fn()
    } as never,
    broadcast: d.broadcast,
    now: () => '2026-07-11T00:00:00.000Z'
  })
}

describe('AcpSessionManager start + happy path', () => {
  it('startPrompt creates a new session, persists, emits ready, returns sessionId', async () => {
    const d = deps()
    const mgr = makeManager(d)
    const res = await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: 'hi',
      cwd: '/tmp'
    })
    expect(res.sessionId).toBe('eng-sess-1')
    expect(d.connection.newSession).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/tmp', mcpServers: [] })
    )
    expect(d.acpSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        engine: 'claude',
        sessionId: 'eng-sess-1',
        cwd: '/tmp'
      })
    )
    expect(d.todos.setSessionId).toHaveBeenCalledWith('task-1', 'eng-sess-1')
    expect(d.broadcast).toHaveBeenCalledWith(
      'acp:session-ready',
      expect.objectContaining({ sessionId: 'eng-sess-1' }),
      'eng-sess-1'
    )
  })

  it('successful runPrompt flips in_progress task to human_review and finishes session completed', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.todos.updateItem).toHaveBeenCalledWith('task-1', { status: 'human_review' })
    expect(d.acpSessions.finish).toHaveBeenCalledWith('eng-sess-1', 'completed', 'end_turn')
    expect(d.broadcast).toHaveBeenCalledWith(
      'acp:complete',
      expect.objectContaining({ sessionId: 'eng-sess-1', stopReason: 'end_turn' }),
      'eng-sess-1'
    )
  })

  it('does not flip task status if it already left in_progress', async () => {
    const d = deps()
    d.todos.getItem.mockReturnValue({ id: 'task-1', status: 'human_review' })
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.todos.updateItem).not.toHaveBeenCalled()
  })
})
