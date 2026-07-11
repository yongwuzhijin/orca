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
        engine: 'cursor' as never,
        prompt: 'x',
        cwd: '/tmp'
      })
    ).rejects.toThrow(EngineFallbackNotWired)
  })
})
