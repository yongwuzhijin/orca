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
