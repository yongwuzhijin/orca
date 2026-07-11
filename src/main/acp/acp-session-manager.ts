// src/main/acp/acp-session-manager.ts
import type {
  AcpConnection,
  AcpEngine,
  StartPromptOptions,
  StartPromptResult
} from '../../shared/acp/acp-session'

type SessionNotification = { sessionId: string; update: unknown }

type ConnectionPoolLike = {
  getAcpConnection: (engine: AcpEngine) => Promise<AcpConnection>
  trackSession: (engine: AcpEngine, sessionId: string) => void
  replaySessionEvents: (sessionId: string, emit: (n: SessionNotification) => void) => void
  recordSessionUpdate: (engine: AcpEngine, sessionId: string, n: SessionNotification) => void
}

type AcpSessionsLike = {
  create: (i: { taskId: string; engine: AcpEngine; sessionId: string; cwd: string }) => unknown
  finish: (sessionId: string, status: string, stopReason: string | null) => void
  listByTask: (taskId: string) => unknown[]
  getBySessionId: (sessionId: string) => unknown
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

  constructor(private readonly deps: AcpSessionManagerDeps) {}

  async startPrompt(opts: StartPromptOptions): Promise<StartPromptResult> {
    const { taskId, engine, prompt, cwd } = opts
    const connection = await this.deps.connectionPool.getAcpConnection(engine)

    const created = await connection.newSession({ cwd, mcpServers: [] })
    const sessionId = created.sessionId
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

    const run = this.runPrompt(taskId, sessionId, prompt, connection)
    this.activePrompts.set(sessionId, run)
    void run.finally(() => this.activePrompts.delete(sessionId))

    return { sessionId }
  }

  private async runPrompt(
    taskId: string,
    sessionId: string,
    prompt: string,
    connection: AcpConnection
  ): Promise<void> {
    const { stopReason } = await connection.prompt({
      sessionId,
      prompt: [{ type: 'text', text: prompt }]
    })
    const task = this.deps.todos.getItem(taskId)
    if (task?.status === 'in_progress') {
      this.deps.todos.updateItem(taskId, { status: 'human_review' })
    }
    this.deps.acpSessions.finish(sessionId, 'completed', stopReason)
    this.deps.broadcast('acp:complete', { sessionId, stopReason }, sessionId)
  }

  // Test hook + reused by the cancel path in a later task.
  waitForPrompt(sessionId: string): Promise<void> {
    return this.activePrompts.get(sessionId) ?? Promise.resolve()
  }

  loadHistory(sessionId: string): void {
    this.deps.connectionPool.replaySessionEvents(sessionId, (n) =>
      this.deps.broadcast('acp:update', n, sessionId)
    )
  }

  listSessions(taskId: string): unknown[] {
    return this.deps.acpSessions.listByTask(taskId)
  }
}
