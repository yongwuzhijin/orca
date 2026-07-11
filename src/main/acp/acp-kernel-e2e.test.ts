import { describe, it, expect, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'
import { AcpConnectionPool } from './acp-connection-pool'
import { AcpPermissionBridge } from './acp-permission-bridge'
import { AcpSessionManager } from './acp-session-manager'
import { createExecuteRouter } from './acp-execute-router'

// Why: opt-in only. Real-spawns tests/mock-acp-agent.mjs and drives the full
// kernel chain (execute-router → session-manager → connection-pool → agent).
// Kept out of the default run because it forks a subprocess per test.
const RUN = process.env.DMON_ACP_E2E === '1'

type CapturedEvent = { channel: string; payload: unknown; scopeId?: string }
type Match = (channel: string, payload: unknown) => boolean

function mockConnect(_engine: unknown, client: unknown) {
  const script = join(process.cwd(), 'tests', 'mock-acp-agent.mjs')
  const child = spawn(process.execPath, [script], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  })
  const stdin = child.stdin
  const stdout = child.stdout
  if (!stdin || !stdout) {
    throw new Error('mock agent spawn produced no stdio pipes')
  }
  const stream = ndJsonStream(
    Writable.toWeb(stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(stdout) as unknown as ReadableStream<Uint8Array>
  )
  const connection = new ClientSideConnection(() => client as never, stream)
  const exitCbs: (() => void)[] = []
  child.on('exit', () => {
    for (const cb of exitCbs) {
      cb()
    }
  })
  return {
    connection: connection as never,
    onExit: (cb: () => void) => exitCbs.push(cb),
    dispose: () => child.kill()
  }
}

function memSessions() {
  const rows = new Map<string, { taskId: string; status: string; stopReason: string | null }>()
  return {
    create: (i: { taskId: string; engine: string; sessionId: string; cwd: string }) => {
      const row = { taskId: i.taskId, status: 'running', stopReason: null as string | null }
      rows.set(i.sessionId, row)
      return row
    },
    finish: (sessionId: string, status: string, stopReason: string | null) => {
      const row = rows.get(sessionId)
      if (row) {
        row.status = status
        row.stopReason = stopReason
      }
    },
    listByTask: (taskId: string) => [...rows.values()].filter((r) => r.taskId === taskId),
    getBySessionId: (sessionId: string) => rows.get(sessionId),
    rows
  }
}

function memTodos() {
  const items = new Map<string, { id: string; status: string; sessionId: string | null }>([
    ['task-1', { id: 'task-1', status: 'in_progress', sessionId: null }]
  ])
  return {
    setSessionId: (id: string, sessionId: string) => {
      const it = items.get(id)
      if (it) {
        it.sessionId = sessionId
      }
    },
    updateItem: vi.fn((id: string, patch: { status: string }) => {
      const it = items.get(id)
      if (it) {
        it.status = patch.status
      }
      return it
    }),
    getItem: (id: string) => items.get(id) ?? null,
    items
  }
}

function makeHarness() {
  const events: CapturedEvent[] = []
  const waiters: { match: Match; resolve: (e: CapturedEvent) => void }[] = []
  const broadcast = (channel: string, payload: unknown, scopeId?: string): void => {
    events.push({ channel, payload, scopeId })
    for (const w of waiters.slice()) {
      if (w.match(channel, payload)) {
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve({ channel, payload, scopeId })
      }
    }
  }
  const waitFor = (match: Match, timeoutMs = 15000): Promise<CapturedEvent> =>
    new Promise((resolve, reject) => {
      const existing = events.find((e) => match(e.channel, e.payload))
      if (existing) {
        resolve(existing)
        return
      }
      const timer = setTimeout(() => reject(new Error('waitFor timeout')), timeoutMs)
      waiters.push({
        match,
        resolve: (e) => {
          clearTimeout(timer)
          resolve(e)
        }
      })
    })

  const sessions = memSessions()
  const todos = memTodos()
  const permissionBridge = new AcpPermissionBridge(broadcast, { autoAllow: true })
  const pool = new AcpConnectionPool({
    connect: mockConnect,
    broadcast,
    requestPermission: (sessionId, params) => permissionBridge.requestPermission(sessionId, params)
  })
  const sessionManager = new AcpSessionManager({
    connectionPool: pool as never,
    acpSessions: sessions as never,
    todos: todos as never,
    permissionBridge: permissionBridge as never,
    broadcast,
    now: () => new Date().toISOString()
  })
  const executeRouter = createExecuteRouter({ sessionManager })

  return {
    events,
    waitFor,
    sessions,
    todos,
    permissionBridge,
    sessionManager,
    executeRouter,
    dispose: () => pool.closeAcpConnection('claude')
  }
}

describe.runIf(RUN)('ACP kernel e2e (real mock-agent spawn)', () => {
  it('runs a prompt end-to-end: echo update, completed, task → human_review', async () => {
    const h = makeHarness()
    try {
      const { sessionId } = await h.executeRouter.executeEnginePrompt({
        taskId: 'task-1',
        engine: 'claude',
        prompt: 'hello',
        cwd: process.cwd()
      })
      expect(sessionId).toMatch(/mock-sess-/)

      const complete = await h.waitFor((c) => c === 'acp:complete')
      expect((complete.payload as { stopReason: string }).stopReason).toBe('end_turn')

      const echo = h.events.find(
        (e) =>
          e.channel === 'acp:session-update' && JSON.stringify(e.payload).includes('echo: hello')
      )
      expect(echo).toBeTruthy()
      expect(h.sessions.rows.get(sessionId)?.status).toBe('completed')
      expect(h.todos.items.get('task-1')?.status).toBe('human_review')
    } finally {
      h.dispose()
    }
  }, 20000)

  it('handles a permission request and still completes (auto-allow)', async () => {
    const h = makeHarness()
    try {
      await h.executeRouter.executeEnginePrompt({
        taskId: 'task-1',
        engine: 'claude',
        prompt: 'PERMISSION_TEST',
        cwd: process.cwd()
      })
      await h.waitFor((c) => c === 'acp:permission-request')
      const complete = await h.waitFor((c) => c === 'acp:complete')
      expect((complete.payload as { stopReason: string }).stopReason).toBe('end_turn')
    } finally {
      h.dispose()
    }
  }, 20000)

  it('cancel stops the run: canceled outcome, task status untouched', async () => {
    const h = makeHarness()
    try {
      const { sessionId } = await h.executeRouter.executeEnginePrompt({
        taskId: 'task-1',
        engine: 'claude',
        prompt: 'SLOW_TEST',
        cwd: process.cwd()
      })
      await h.waitFor((c) => c === 'acp:session-ready')
      await h.sessionManager.cancelSession(sessionId)

      const outcome = await h.waitFor((c) => c === 'acp:task-outcome')
      expect((outcome.payload as { result: string }).result).toBe('canceled')
      expect(h.sessions.rows.get(sessionId)?.status).toBe('canceled')
      expect(h.todos.updateItem).not.toHaveBeenCalled()
    } finally {
      h.dispose()
    }
  }, 20000)
})
