// src/main/acp/acp-connection-pool.ts
import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'
import type { AcpConnection, AcpEngine } from '../../shared/acp/acp-session'
import type { PermissionOutcome } from './acp-permission-bridge'
import { getAgentLaunchSpec } from './acp-agent-launcher'
import { OrcaAcpClient } from './acp-client'

type SessionNotification = { sessionId: string; update: unknown }

type RequestPermissionParams = {
  options: { optionId: string; name: string; kind: string }[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

type RequestPermissionFn = (
  sessionId: string,
  params: RequestPermissionParams
) => Promise<PermissionOutcome>

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

// Why: the shared AcpConnection type omits initialize (the ACP handshake is not
// part of the session surface the session-manager uses); widen locally so the
// pool can run the handshake against both real and fake connections.
type PooledConnection = AcpConnection & {
  initialize?: (params: unknown) => Promise<unknown>
  authenticate?: (params: { methodId: string }) => Promise<unknown>
}

const EVENT_CACHE_CAP = 3000

export type ConnectResult = {
  connection: PooledConnection
  onExit: (cb: () => void) => void
  dispose: () => void
}

type ConnectFn = (engine: AcpEngine, client: unknown) => ConnectResult

type BuildClientFn = (
  engine: AcpEngine,
  onSessionUpdate: (n: SessionNotification) => void
) => unknown

export type PoolDeps = {
  connect?: ConnectFn
  buildClient?: BuildClientFn
  broadcast?: BroadcastFn
  requestPermission?: RequestPermissionFn
}

type PoolEntry = {
  connection: PooledConnection
  dispose: () => void
  sessionIds: Set<string>
}

export class AcpConnectionPool {
  private entries = new Map<AcpEngine, PoolEntry>()
  private eventCache = new Map<string, SessionNotification[]>()
  private readonly connect: ConnectFn
  private readonly buildClient: BuildClientFn
  private readonly broadcast: BroadcastFn
  private readonly requestPermission: RequestPermissionFn

  constructor(deps: PoolDeps = {}) {
    this.connect = deps.connect ?? defaultConnect
    this.broadcast = deps.broadcast ?? (() => {})
    this.requestPermission = deps.requestPermission ?? (async () => ({ outcome: 'cancelled' }))
    this.buildClient =
      deps.buildClient ??
      ((engine, onSessionUpdate) =>
        new OrcaAcpClient(engine, {
          onSessionUpdate,
          requestPermission: this.requestPermission
        }))
  }

  async getAcpConnection(engine: AcpEngine): Promise<AcpConnection> {
    const existing = this.entries.get(engine)
    if (existing) {
      return existing.connection
    }

    const onSessionUpdate = (notif: SessionNotification): void => {
      this.recordSessionUpdate(engine, notif.sessionId, notif)
      this.broadcast('acp:session-update', notif, notif.sessionId)
    }
    const client = this.buildClient(engine, onSessionUpdate)
    const result = this.connect(engine, client)
    const entry: PoolEntry = {
      connection: result.connection,
      dispose: result.dispose,
      sessionIds: new Set()
    }
    this.entries.set(engine, entry)
    result.onExit(() => this.handleExit(engine))
    if (typeof result.connection.initialize === 'function') {
      const initResult = (await result.connection.initialize({
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        clientInfo: { name: 'orca', version: '0' }
      })) as { authMethods?: { id: string }[] } | undefined
      // cursor 需在 initialize 后显式 authenticate,否则 newSession 因未鉴权被拒;
      // 其它引擎不含 cursor_login 时跳过,保持零回归。
      const methods = initResult?.authMethods ?? []
      if (
        engine === 'cursor' &&
        typeof result.connection.authenticate === 'function' &&
        methods.some((m) => m.id === 'cursor_login')
      ) {
        await result.connection.authenticate({ methodId: 'cursor_login' })
      }
    }
    return entry.connection
  }

  recordSessionUpdate(_engine: AcpEngine, sessionId: string, notif: SessionNotification): void {
    const list = this.eventCache.get(sessionId) ?? []
    list.push(notif)
    if (list.length > EVENT_CACHE_CAP) {
      list.splice(0, list.length - EVENT_CACHE_CAP)
    }
    this.eventCache.set(sessionId, list)
  }

  replaySessionEvents(sessionId: string, emit: (n: SessionNotification) => void): void {
    for (const n of this.eventCache.get(sessionId) ?? []) {
      emit(n)
    }
  }

  trackSession(engine: AcpEngine, sessionId: string): void {
    this.entries.get(engine)?.sessionIds.add(sessionId)
  }

  closeAcpConnection(engine: AcpEngine): void {
    const entry = this.entries.get(engine)
    if (!entry) {
      return
    }
    entry.dispose()
    this.entries.delete(engine)
  }

  // Why: when the agent process dies, its in-flight session event caches are
  // stale — drop them and the entry so the next getAcpConnection respawns.
  private handleExit(engine: AcpEngine): void {
    const entry = this.entries.get(engine)
    if (!entry) {
      return
    }
    for (const sessionId of entry.sessionIds) {
      this.eventCache.delete(sessionId)
    }
    this.entries.delete(engine)
  }
}

// Why: real spawn + SDK wiring; unit tests inject a fake connect so this path is
// only exercised by the opt-in mock-agent integration test (task 18).
function defaultConnect(engine: AcpEngine, client: unknown): ConnectResult {
  const spec = getAgentLaunchSpec(engine)
  const child = spawn(spec.command, spec.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...spec.env }
  })
  const stdin = child.stdin
  const stdout = child.stdout
  if (!stdin || !stdout) {
    throw new Error('ACP agent spawn produced no stdio pipes')
  }
  // Why: ndJsonStream needs Web streams; child stdio are Node streams. Output =
  // child.stdin (we write to the agent), input = child.stdout (agent -> us).
  const stream = ndJsonStream(
    Writable.toWeb(stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(stdout) as unknown as ReadableStream<Uint8Array>
  )
  const connection = new ClientSideConnection(
    () => client as never,
    stream
  ) as unknown as PooledConnection
  const exitCbs: (() => void)[] = []
  child.on('exit', () => {
    for (const cb of exitCbs) {
      cb()
    }
  })
  return {
    connection,
    onExit: (cb) => exitCbs.push(cb),
    dispose: () => {
      child.kill()
    }
  }
}
