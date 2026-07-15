// src/main/acp/acp-session-manager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AcpSessionManager } from './acp-session-manager'

function deps() {
  const connection = {
    newSession: vi.fn().mockResolvedValue({
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
      rejectAllForSession: vi.fn(),
      setPermissionMode: vi.fn()
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

  // Why: engines rarely echo client prompts as user_message_chunk; cache the
  // outbound prompt so loadHistory can restore it within the process lifetime.
  it('startPrompt records the outbound prompt as a user_message_chunk before prompting', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: '生成CLAUDE.md',
      cwd: '/tmp'
    })
    expect(d.connectionPool.recordSessionUpdate).toHaveBeenCalledWith('claude', 'eng-sess-1', {
      sessionId: 'eng-sess-1',
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: '生成CLAUDE.md' }
      }
    })
    const recordOrder = d.connectionPool.recordSessionUpdate.mock.invocationCallOrder[0]
    const promptOrder = d.connection.prompt.mock.invocationCallOrder[0]
    expect(recordOrder).toBeLessThan(promptOrder)
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

describe('AcpSessionManager cancel / concurrency / resume / error', () => {
  it('loads persisted agent history when the in-memory event cache is empty', async () => {
    const d = deps()
    d.connectionPool.replaySessionEvents.mockReturnValue(0)
    d.acpSessions.getBySessionId.mockReturnValue({
      taskId: 'task-1',
      engine: 'claude',
      sessionId: 'eng-sess-1',
      cwd: '/tmp'
    })
    const mgr = makeManager(d)

    await mgr.loadHistory('eng-sess-1')

    expect(d.connectionPool.getAcpConnection).toHaveBeenCalledWith('claude')
    expect(d.connectionPool.trackSession).toHaveBeenCalledWith('claude', 'eng-sess-1')
    expect(d.connection.loadSession).toHaveBeenCalledWith({
      sessionId: 'eng-sess-1',
      cwd: '/tmp',
      mcpServers: []
    })
  })

  it('uses cached history without loading the agent session again', async () => {
    const d = deps()
    d.connectionPool.replaySessionEvents.mockReturnValue(2)
    const mgr = makeManager(d)

    await mgr.loadHistory('eng-sess-1')

    expect(d.acpSessions.getBySessionId).not.toHaveBeenCalled()
    expect(d.connection.loadSession).not.toHaveBeenCalled()
  })

  it('rejects a second prompt on the same session', async () => {
    const d = deps()
    let resolvePrompt: (v: { stopReason: string }) => void = () => {}
    d.connection.prompt.mockImplementation(() => new Promise((r) => (resolvePrompt = r)))
    const mgr = makeManager(d)
    const { sessionId } = await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: 'a',
      cwd: '/tmp'
    })
    await expect(mgr.promptExisting(sessionId, 'b')).rejects.toThrow(/in flight/i)
    resolvePrompt({ stopReason: 'end_turn' })
    await mgr.waitForPrompt(sessionId)
  })

  it('cancelSession cancels, finishes canceled, emits task-outcome, leaves status', async () => {
    const d = deps()
    let resolvePrompt: (v: { stopReason: string }) => void = () => {}
    d.connection.prompt.mockImplementation(() => new Promise((r) => (resolvePrompt = r)))
    const mgr = makeManager(d)
    const { sessionId } = await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: 'SLOW_TEST',
      cwd: '/tmp'
    })
    const p = mgr.cancelSession(sessionId)
    resolvePrompt({ stopReason: 'cancelled' })
    await p
    expect(d.connection.cancel).toHaveBeenCalledWith({ sessionId })
    expect(d.acpSessions.finish).toHaveBeenCalledWith(sessionId, 'canceled', expect.anything())
    expect(d.broadcast).toHaveBeenCalledWith(
      'acp:task-outcome',
      expect.objectContaining({ taskId: 'task-1', result: 'canceled' }),
      'task-1'
    )
    expect(d.todos.updateItem).not.toHaveBeenCalled()
  })

  it('resumeSessionId uses resumeSession, falling back to loadSession on failure', async () => {
    const d = deps()
    d.connection.resumeSession.mockRejectedValueOnce(new Error('nope'))
    d.connection.loadSession.mockResolvedValueOnce({ sessionId: 'eng-sess-1' })
    const mgr = makeManager(d)
    const res = await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: 'hi',
      cwd: '/tmp',
      resumeSessionId: 'eng-sess-1'
    })
    expect(d.connection.resumeSession).toHaveBeenCalled()
    expect(d.connection.loadSession).toHaveBeenCalled()
    expect(d.connection.newSession).not.toHaveBeenCalled()
    expect(res.sessionId).toBe('eng-sess-1')
    await mgr.waitForPrompt('eng-sess-1')
  })

  it('runPrompt error finishes error, emits acp:error + task-outcome, no status change', async () => {
    const d = deps()
    d.connection.prompt.mockRejectedValueOnce(new Error('boom'))
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.acpSessions.finish).toHaveBeenCalledWith(
      'eng-sess-1',
      'error',
      expect.stringContaining('boom')
    )
    expect(d.broadcast).toHaveBeenCalledWith(
      'acp:error',
      expect.objectContaining({
        sessionId: 'eng-sess-1',
        message: expect.stringContaining('boom')
      }),
      'eng-sess-1'
    )
    expect(d.broadcast).toHaveBeenCalledWith(
      'acp:task-outcome',
      expect.objectContaining({ taskId: 'task-1', result: 'error' }),
      'task-1'
    )
    expect(d.todos.updateItem).not.toHaveBeenCalled()
  })
})

describe('AcpSessionManager permission mode (P2b)', () => {
  it('setPermissionMode delegates to permissionBridge', () => {
    const setPermissionMode = vi.fn()
    const manager = new AcpSessionManager({
      permissionBridge: {
        requestPermission: vi.fn(),
        resolvePermission: vi.fn(),
        rejectAllForSession: vi.fn(),
        setPermissionMode
      }
    } as never)
    manager.setPermissionMode('s1', 'ask')
    expect(setPermissionMode).toHaveBeenCalledWith('s1', 'ask')
  })
})

describe('AcpSessionManager autoPilot flip suppression', () => {
  it('does NOT flip in_progress→human_review when started with autoPilot', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: 'hi',
      cwd: '/tmp',
      autoPilot: { maxTurns: 5 }
    })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.todos.updateItem).not.toHaveBeenCalledWith('task-1', { status: 'human_review' })
  })

  it('flipToHumanReview flips only when task is still in_progress', () => {
    const d = deps()
    const mgr = makeManager(d)
    d.todos.getItem.mockReturnValue({ id: 'task-1', status: 'in_progress' })
    mgr.flipToHumanReview('task-1')
    expect(d.todos.updateItem).toHaveBeenCalledWith('task-1', { status: 'human_review' })

    d.todos.updateItem.mockClear()
    d.todos.getItem.mockReturnValue({ id: 'task-1', status: 'done' })
    mgr.flipToHumanReview('task-1')
    expect(d.todos.updateItem).not.toHaveBeenCalled()
  })

  it('readLastOutcome reflects the finished turn', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(mgr.readLastOutcome('eng-sess-1')).toBe('completed')
  })
})
