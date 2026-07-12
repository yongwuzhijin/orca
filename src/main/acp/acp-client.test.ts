import { describe, it, expect, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OrcaAcpClient } from './acp-client'

describe('OrcaAcpClient', () => {
  it('sessionUpdate forwards notification to onSessionUpdate', async () => {
    const onSessionUpdate = vi.fn()
    const client = new OrcaAcpClient('claude', {
      onSessionUpdate,
      requestPermission: vi.fn()
    })
    const notif = { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk' } }
    await client.sessionUpdate(notif as never)
    expect(onSessionUpdate).toHaveBeenCalledWith(notif)
  })

  it('requestPermission delegates to injected handler and wraps the outcome', async () => {
    const requestPermission = vi.fn().mockResolvedValue({ outcome: 'selected', optionId: 'allow' })
    const client = new OrcaAcpClient('claude', {
      onSessionUpdate: vi.fn(),
      requestPermission
    })
    const params = { sessionId: 's1', options: [], toolCall: { toolCallId: 't', title: 'x' } }
    const res = await client.requestPermission(params as never)
    expect(requestPermission).toHaveBeenCalledWith('s1', expect.objectContaining({ options: [] }))
    expect(res).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } })
  })

  it('readTextFile / writeTextFile hit the real fs', async () => {
    const client = new OrcaAcpClient('claude', {
      onSessionUpdate: vi.fn(),
      requestPermission: vi.fn()
    })
    const dir = await fs.mkdtemp(join(tmpdir(), 'acp-client-'))
    const path = join(dir, 'a.txt')
    await client.writeTextFile({ path, content: 'hello' } as never)
    const out = await client.readTextFile({ path } as never)
    expect(out.content).toBe('hello')
  })
})

function make() {
  const onSessionUpdate = vi.fn()
  const client = new OrcaAcpClient('cursor', {
    onSessionUpdate,
    requestPermission: vi.fn()
  })
  return { client, onSessionUpdate }
}

describe('cursor extension methods (P2b)', () => {
  it('answers blocking cursor/ask_question with empty default', async () => {
    const { client } = make()
    const res = await client.extMethod('cursor/ask_question', { sessionId: 's1' })
    expect(res).toBeDefined()
  })

  it('confirms blocking cursor/create_plan', async () => {
    const { client } = make()
    const res = await client.extMethod('cursor/create_plan', { sessionId: 's1' })
    expect(res).toBeDefined()
  })

  it('normalizes cursor/update_todos into a session update', async () => {
    const { client, onSessionUpdate } = make()
    await client.extNotification('cursor/update_todos', {
      sessionId: 's1',
      todos: [{ content: 'do X', status: 'pending' }]
    })
    expect(onSessionUpdate).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }))
  })

  it('normalizes cursor/task into a session update', async () => {
    const { client, onSessionUpdate } = make()
    await client.extNotification('cursor/task', { sessionId: 's1', title: 't' })
    expect(onSessionUpdate).toHaveBeenCalled()
  })

  it('throws on unknown ext request (non-cursor)', async () => {
    const { client } = make()
    await expect(client.extMethod('foo/bar', {})).rejects.toThrow()
  })
})
