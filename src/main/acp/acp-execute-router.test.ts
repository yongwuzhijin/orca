import { describe, it, expect, vi } from 'vitest'
import { createExecuteRouter, EngineFallbackNotWired } from './acp-execute-router'

describe('acp-execute-router', () => {
  it('routes claude/qoder to the ACP session manager', async () => {
    const startPrompt = vi.fn().mockResolvedValue({ sessionId: 's1' })
    const router = createExecuteRouter({ sessionManager: { startPrompt } as never })
    const r1 = await router.executeEnginePrompt({
      taskId: 't',
      engine: 'claude',
      prompt: 'x',
      cwd: '/tmp'
    })
    expect(r1).toEqual({ sessionId: 's1' })
    await router.executeEnginePrompt({ taskId: 't', engine: 'qoder', prompt: 'x', cwd: '/tmp' })
    expect(startPrompt).toHaveBeenCalledTimes(2)
  })

  it('throws EngineFallbackNotWired for non-ACP engines', async () => {
    const router = createExecuteRouter({ sessionManager: { startPrompt: vi.fn() } as never })
    await expect(
      router.executeEnginePrompt({
        taskId: 't',
        engine: 'codex' as never,
        prompt: 'x',
        cwd: '/tmp'
      })
    ).rejects.toThrow(EngineFallbackNotWired)
  })

  it('delegates to autoPilotRunner when opts.autoPilot is present', async () => {
    const sessionManager = { startPrompt: vi.fn(async () => ({ sessionId: 's1' })) }
    const autoPilotRunner = { run: vi.fn(async () => ({ sessionId: 's2' })) }
    const router = createExecuteRouter({ sessionManager, autoPilotRunner } as never)
    const res = await router.executeEnginePrompt({
      taskId: 't1',
      engine: 'claude',
      prompt: 'x',
      cwd: '/tmp',
      autoPilot: { maxTurns: 4 }
    })
    expect(autoPilotRunner.run).toHaveBeenCalledOnce()
    expect(sessionManager.startPrompt).not.toHaveBeenCalled()
    expect(res.sessionId).toBe('s2')
  })

  it('uses startPrompt when autoPilot is absent', async () => {
    const sessionManager = { startPrompt: vi.fn(async () => ({ sessionId: 's1' })) }
    const autoPilotRunner = { run: vi.fn() }
    const router = createExecuteRouter({ sessionManager, autoPilotRunner } as never)
    await router.executeEnginePrompt({ taskId: 't1', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    expect(sessionManager.startPrompt).toHaveBeenCalledOnce()
    expect(autoPilotRunner.run).not.toHaveBeenCalled()
  })
})
