import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'
import { Readable, Writable } from 'node:stream'

// Why: minimal in-repo ACP agent for TDD; supports the flows P2a exercises.
const sessions = new Map()
let counter = 0

function makeAgent(conn) {
  return {
    async initialize() {
      return { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [] }
    },
    async authenticate() {
      return {}
    },
    async newSession({ cwd }) {
      const sessionId = `mock-sess-${++counter}`
      sessions.set(sessionId, { cwd, history: [] })
      return {
        sessionId,
        modes: { current: 'default', available: ['default', 'bypassPermissions'] },
        models: []
      }
    },
    async resumeSession({ sessionId }) {
      if (!sessions.has(sessionId)) {
        throw new Error('no such session')
      }
      return { sessionId }
    },
    async loadSession({ sessionId }) {
      if (!sessions.has(sessionId)) {
        throw new Error('no such session')
      }
      return { sessionId }
    },
    async listSessions() {
      return { sessions: [...sessions.keys()].map((id) => ({ sessionId: id })) }
    },
    async setSessionMode() {
      return {}
    },
    async cancel({ sessionId }) {
      const s = sessions.get(sessionId)
      if (s) {
        s.canceled = true
      }
      return {}
    },
    async prompt({ sessionId, prompt }) {
      const text = (prompt ?? []).map((p) => p.text ?? '').join('')
      const send = (update) => conn.sessionUpdate({ sessionId, update })

      if (text.includes('PERMISSION_TEST')) {
        await conn.requestPermission({
          sessionId,
          options: [
            { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
            { optionId: 'deny', name: 'Deny', kind: 'reject_once' }
          ],
          toolCall: { toolCallId: 'tc-1', title: 'mock tool', kind: 'edit' }
        })
      }

      if (text.includes('CURSOR_EXT_TEST')) {
        // 通知型:驱动 plan(update_todos)。
        conn.extNotification?.('cursor/update_todos', {
          sessionId,
          todos: [{ content: 'mock todo', status: 'pending' }]
        })
        // 阻塞型请求:等待 client 兜底应答。
        await conn.extMethod?.('cursor/create_plan', { sessionId, entries: [] })
      }

      if (text.includes('SLOW_TEST')) {
        const s = sessions.get(sessionId)
        for (let i = 0; i < 50; i++) {
          if (s?.canceled) {
            return { stopReason: 'cancelled' }
          }
          await new Promise((r) => setTimeout(r, 100))
        }
        return { stopReason: 'end_turn' }
      }

      await send({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: `echo: ${text}` }
      })
      return { stopReason: 'end_turn' }
    }
  }
}

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))
new AgentSideConnection((conn) => makeAgent(conn), stream)
