import { describe, it, expect, vi } from 'vitest'
import { buildAcpKernel } from './acp-kernel'

const stubRepos = {
  acpSessions: {
    create: () => ({}),
    finish: () => {},
    listByTask: () => [],
    getBySessionId: () => undefined
  } as never,
  todos: {
    setSessionId: () => {},
    updateItem: () => ({}),
    getItem: () => ({ id: 't', status: 'in_progress' })
  } as never,
  now: () => '2026-07-11T00:00:00.000Z'
}

// buildAcpKernel wires pool+manager+router+bridge from injected repos, no electron deps.
describe('buildAcpKernel', () => {
  it('produces an execute router backed by the session manager', () => {
    const kernel = buildAcpKernel({
      ...stubRepos,
      broadcast: () => {}
    })
    expect(typeof kernel.executeRouter.executeEnginePrompt).toBe('function')
    expect(typeof kernel.sessionManager.cancelSession).toBe('function')
    expect(kernel.connectionPool).toBeTruthy()
  })

  // Why: without wiring broadcast into the pool, agent sessionUpdate is cached
  // but never reaches the renderer — In Progress shows Cancel with an empty chat.
  it('forwards pool session updates through the injected broadcast', async () => {
    const broadcast = vi.fn()
    let onSessionUpdate: ((n: { sessionId: string; update: unknown }) => void) | undefined
    const kernel = buildAcpKernel({
      ...stubRepos,
      broadcast,
      pool: {
        buildClient: (_engine, update) => {
          onSessionUpdate = update
          return {}
        },
        connect: (() => ({
          connection: { initialize: async () => ({}) },
          onExit: () => {},
          dispose: () => {}
        })) as never
      }
    })
    await kernel.connectionPool.getAcpConnection('claude')
    onSessionUpdate?.({
      sessionId: 's1',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hi' }
      }
    })
    expect(broadcast).toHaveBeenCalledWith(
      'acp:session-update',
      expect.objectContaining({ sessionId: 's1' }),
      's1'
    )
  })
})
