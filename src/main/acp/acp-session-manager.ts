// src/main/acp/acp-session-manager.ts
import type {
  AcpConnection,
  AcpEngine,
  AcpNewSessionResult,
  AcpSessionRecord,
  StartPromptOptions,
  StartPromptResult
} from '../../shared/acp/acp-session'

type SessionNotification = { sessionId: string; update: unknown }

type ConnectionPoolLike = {
  getAcpConnection: (engine: AcpEngine) => Promise<AcpConnection>
  trackSession: (engine: AcpEngine, sessionId: string) => void
  replaySessionEvents: (sessionId: string, emit: (n: SessionNotification) => void) => number
  recordSessionUpdate: (engine: AcpEngine, sessionId: string, n: SessionNotification) => void
}

type AcpSessionsLike = {
  create: (i: { taskId: string; engine: AcpEngine; sessionId: string; cwd: string }) => unknown
  finish: (sessionId: string, status: string, stopReason: string | null) => void
  listByTask: (taskId: string) => unknown[]
  getBySessionId: (sessionId: string) => AcpSessionRecord | null | undefined
}

type TodosLike = {
  setSessionId: (id: string, sessionId: string) => void
  updateItem: (id: string, patch: { status: string }) => unknown
  getItem: (id: string) => { id: string; status: string } | null | undefined
}

type PermissionBridgeLike = {
  requestPermission: (sessionId: string, params: unknown) => Promise<unknown>
  resolvePermission: (requestId: string, optionId: string) => boolean
  rejectAllForSession: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: 'auto' | 'ask') => void
}

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type AcpSessionManagerDeps = {
  connectionPool: ConnectionPoolLike
  acpSessions: AcpSessionsLike
  todos: TodosLike
  permissionBridge: PermissionBridgeLike
  broadcast: BroadcastFn
  now: () => string
}

export class AcpSessionManager {
  private activePrompts = new Map<string, Promise<void>>()
  private engineOf = new Map<string, AcpEngine>()
  private taskOf = new Map<string, string>()
  private canceled = new Set<string>()
  private autoPilotSessions = new Set<string>()
  private lastOutcome = new Map<string, 'completed' | 'error' | 'canceled'>()

  constructor(private readonly deps: AcpSessionManagerDeps) {}

  async startPrompt(opts: StartPromptOptions): Promise<StartPromptResult> {
    const { taskId, engine, prompt, cwd } = opts
    const connection = await this.deps.connectionPool.getAcpConnection(engine)

    const created = await this.acquireSession(connection, opts)
    const sessionId = created.sessionId
    this.engineOf.set(sessionId, engine)
    this.taskOf.set(sessionId, taskId)
    this.deps.connectionPool.trackSession(engine, sessionId)

    this.deps.acpSessions.create({ taskId, engine, sessionId, cwd })
    this.deps.todos.setSessionId(taskId, sessionId)

    // Why: happy path is permissive; setSessionMode is best-effort (engine may not support it).
    if (typeof connection.setSessionMode === 'function') {
      try {
        await connection.setSessionMode({ sessionId, modeId: 'bypassPermissions' })
      } catch {
        // ignore — mode unsupported
      }
    }

    this.deps.broadcast(
      'acp:session-ready',
      { sessionId, modes: created.modes ?? null, models: created.models ?? [] },
      sessionId
    )

    // Why: engines rarely echo the client-sent prompt as user_message_chunk.
    // Cache it before prompting so in-process history replay can restore it.
    this.deps.connectionPool.recordSessionUpdate(engine, sessionId, {
      sessionId,
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: prompt }
      }
    })

    // AutoPilot must be marked before runPrompt starts so the mid-loop turn
    // never flips the task to human_review; the runner owns the final flip.
    if (opts.autoPilot) {
      this.autoPilotSessions.add(sessionId)
    }

    const run = this.runPrompt(taskId, sessionId, prompt, connection)
    this.activePrompts.set(sessionId, run)
    void run.finally(() => this.activePrompts.delete(sessionId))

    return { sessionId }
  }

  // resumeSessionId → resumeSession, falling back to loadSession (engine may have
  // dropped the live session but the transcript can still be replayed from disk).
  private async acquireSession(
    connection: AcpConnection,
    opts: StartPromptOptions
  ): Promise<AcpNewSessionResult> {
    if (opts.resumeSessionId) {
      try {
        return await connection.resumeSession({
          sessionId: opts.resumeSessionId,
          cwd: opts.cwd
        })
      } catch {
        await connection.loadSession({
          sessionId: opts.resumeSessionId,
          cwd: opts.cwd,
          mcpServers: []
        })
        return { sessionId: opts.resumeSessionId }
      }
    }
    return connection.newSession({ cwd: opts.cwd, mcpServers: [] })
  }

  private async runPrompt(
    taskId: string,
    sessionId: string,
    prompt: string,
    connection: AcpConnection
  ): Promise<void> {
    try {
      const { stopReason } = await connection.prompt({
        sessionId,
        prompt: [{ type: 'text', text: prompt }]
      })
      if (this.canceled.has(sessionId) || stopReason === 'cancelled') {
        this.lastOutcome.set(sessionId, 'canceled')
        this.deps.acpSessions.finish(sessionId, 'canceled', stopReason ?? 'cancelled')
        this.deps.broadcast('acp:task-outcome', { taskId, sessionId, result: 'canceled' }, taskId)
        return
      }
      // AutoPilot suppresses the per-turn flip; the runner flips once at loop end.
      if (!this.autoPilotSessions.has(sessionId)) {
        const task = this.deps.todos.getItem(taskId)
        if (task?.status === 'in_progress') {
          this.deps.todos.updateItem(taskId, { status: 'human_review' })
        }
      }
      this.lastOutcome.set(sessionId, 'completed')
      this.deps.acpSessions.finish(sessionId, 'completed', stopReason)
      this.deps.broadcast('acp:complete', { sessionId, stopReason }, sessionId)
    } catch (err) {
      // Error/cancel are terminal-but-not-status-changing: surface to renderer,
      // record on the session row, leave the task where the user can retry.
      const message = err instanceof Error ? err.message : String(err)
      this.lastOutcome.set(sessionId, 'error')
      this.deps.acpSessions.finish(sessionId, 'error', message)
      this.deps.broadcast('acp:error', { sessionId, message }, sessionId)
      this.deps.broadcast('acp:task-outcome', { taskId, sessionId, result: 'error' }, taskId)
    }
  }

  async promptExisting(sessionId: string, prompt: string): Promise<void> {
    if (this.activePrompts.has(sessionId)) {
      throw new Error('Session already has a prompt in flight')
    }
    const engine = this.engineOf.get(sessionId)
    const taskId = this.taskOf.get(sessionId)
    if (!engine || !taskId) {
      throw new Error('Unknown session')
    }
    const connection = await this.deps.connectionPool.getAcpConnection(engine)
    this.deps.connectionPool.recordSessionUpdate(engine, sessionId, {
      sessionId,
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: prompt }
      }
    })
    const run = this.runPrompt(taskId, sessionId, prompt, connection)
    this.activePrompts.set(sessionId, run)
    void run.finally(() => this.activePrompts.delete(sessionId))
    return run
  }

  async cancelSession(sessionId: string): Promise<{ ok: boolean }> {
    const engine = this.engineOf.get(sessionId)
    if (!engine) {
      return { ok: false }
    }
    this.canceled.add(sessionId)
    this.deps.permissionBridge.rejectAllForSession(sessionId)
    const connection = await this.deps.connectionPool.getAcpConnection(engine)
    await connection.cancel({ sessionId })
    await this.waitForPrompt(sessionId)
    return { ok: true }
  }

  // Test hook + reused by the cancel path in a later task.
  waitForPrompt(sessionId: string): Promise<void> {
    return this.activePrompts.get(sessionId) ?? Promise.resolve()
  }

  async loadHistory(sessionId: string): Promise<void> {
    const replayed = this.deps.connectionPool.replaySessionEvents(sessionId, (n) =>
      this.deps.broadcast('acp:update', n, sessionId)
    )
    if (replayed > 0) {
      return
    }

    const record = this.deps.acpSessions.getBySessionId(sessionId)
    if (!record) {
      return
    }

    // Why: the pool cache is process-local. After an app restart, ask the
    // engine to load its persisted session; ACP replays messages as updates.
    const connection = await this.deps.connectionPool.getAcpConnection(record.engine)
    this.engineOf.set(sessionId, record.engine)
    this.taskOf.set(sessionId, record.taskId)
    this.deps.connectionPool.trackSession(record.engine, sessionId)
    await connection.loadSession({ sessionId, cwd: record.cwd, mcpServers: [] })
  }

  listSessions(taskId: string): unknown[] {
    return this.deps.acpSessions.listByTask(taskId)
  }

  setPermissionMode(sessionId: string, mode: 'auto' | 'ask'): void {
    this.deps.permissionBridge.setPermissionMode(sessionId, mode)
  }

  markAutoPilot(sessionId: string): void {
    this.autoPilotSessions.add(sessionId)
  }

  unmarkAutoPilot(sessionId: string): void {
    this.autoPilotSessions.delete(sessionId)
  }

  readLastOutcome(sessionId: string): 'completed' | 'error' | 'canceled' | undefined {
    return this.lastOutcome.get(sessionId)
  }

  flipToHumanReview(taskId: string): void {
    const task = this.deps.todos.getItem(taskId)
    if (task?.status === 'in_progress') {
      this.deps.todos.updateItem(taskId, { status: 'human_review' })
    }
  }

  // Why: verdict lives in the just-finished turn only. Collect from the pool's
  // per-session event cache and keep agent text emitted after the last user
  // chunk (each turn records a user_message_chunk before the agent responds).
  readLastTurnText(sessionId: string): string {
    const collected: { role: 'user' | 'agent'; text: string }[] = []
    this.deps.connectionPool.replaySessionEvents(sessionId, (n) => {
      const update = (n as { update?: { sessionUpdate?: string; content?: unknown } }).update
      if (update?.sessionUpdate === 'user_message_chunk') {
        collected.push({ role: 'user', text: '' })
      } else if (update?.sessionUpdate === 'agent_message_chunk') {
        const content = update.content as { type?: string; text?: string } | undefined
        if (content?.type === 'text' && typeof content.text === 'string') {
          collected.push({ role: 'agent', text: content.text })
        }
      }
    })
    let start = 0
    for (let i = collected.length - 1; i >= 0; i--) {
      if (collected[i].role === 'user') {
        start = i + 1
        break
      }
    }
    return collected
      .slice(start)
      .filter((c) => c.role === 'agent')
      .map((c) => c.text)
      .join('')
  }
}
