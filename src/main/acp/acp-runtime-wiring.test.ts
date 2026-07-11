import { describe, it, expect } from 'vitest'
import { buildAcpKernel } from './acp-kernel'

// buildAcpKernel wires pool+manager+router+bridge from injected repos, no electron deps.
describe('buildAcpKernel', () => {
  it('produces an execute router backed by the session manager', () => {
    const acpSessions = {
      create: () => ({}),
      finish: () => {},
      listByTask: () => [],
      getBySessionId: () => undefined
    }
    const todos = {
      setSessionId: () => {},
      updateItem: () => ({}),
      getItem: () => ({ id: 't', status: 'in_progress' })
    }
    const kernel = buildAcpKernel({
      acpSessions: acpSessions as never,
      todos: todos as never,
      broadcast: () => {},
      now: () => '2026-07-11T00:00:00.000Z'
    })
    expect(typeof kernel.executeRouter.executeEnginePrompt).toBe('function')
    expect(typeof kernel.sessionManager.cancelSession).toBe('function')
    expect(kernel.connectionPool).toBeTruthy()
  })
})
