import { describe, it, expect, vi } from 'vitest'
import { createAutoPilotRunner } from './acp-autopilot-runner'

type Outcome = 'completed' | 'error' | 'canceled'

function makeSessionManager(turns: { text: string; outcome: Outcome }[]) {
  let turn = 0
  const sm = {
    // Typed params here so `.mock.calls[0][0]` is accessible under vitest v4's
    // single-generic `vi.fn` signature (was two-arg `<Args, Return>` in v3).
    startPrompt: vi.fn(async (_opts: { prompt: string }) => ({ sessionId: 'sess-1' })),
    promptExisting: vi.fn(async () => {
      turn++
    }),
    waitForPrompt: vi.fn(async () => {}),
    readLastTurnText: vi.fn(() => turns[turn]?.text ?? ''),
    readLastOutcome: vi.fn<() => Outcome>(() => turns[turn]?.outcome ?? 'completed'),
    markAutoPilot: vi.fn(),
    unmarkAutoPilot: vi.fn(),
    setPermissionMode: vi.fn(),
    flipToHumanReview: vi.fn()
  }
  return sm
}

const opts = {
  taskId: 'task-1',
  engine: 'claude' as const,
  prompt: 'do it',
  cwd: '/tmp',
  autoPilot: { maxTurns: 5 }
}

describe('createAutoPilotRunner', () => {
  it('flips to human_review after a turn-1 COMPLETE', async () => {
    const sm = makeSessionManager([{ text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    const res = await runner.run(opts)
    expect(res.sessionId).toBe('sess-1')
    expect(sm.promptExisting).not.toHaveBeenCalled()
    expect(sm.flipToHumanReview).toHaveBeenCalledWith('task-1')
    expect(sm.unmarkAutoPilot).toHaveBeenCalledWith('sess-1')
  })

  it('continues then completes across two turns', async () => {
    const sm = makeSessionManager([
      { text: 'AUTOPILOT: CONTINUE — more', outcome: 'completed' },
      { text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }
    ])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    expect(sm.promptExisting).toHaveBeenCalledTimes(1)
    expect(sm.flipToHumanReview).toHaveBeenCalledTimes(1)
  })

  it('stops at maxTurns and flips (fallback)', async () => {
    const sm = makeSessionManager(
      Array.from({ length: 6 }, () => ({
        text: 'AUTOPILOT: CONTINUE',
        outcome: 'completed' as Outcome
      }))
    )
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run({ ...opts, autoPilot: { maxTurns: 3 } })
    // 3 turns total => 2 continuation prompts after turn 1
    expect(sm.promptExisting).toHaveBeenCalledTimes(2)
    expect(sm.flipToHumanReview).toHaveBeenCalledTimes(1)
  })

  it('stops without flip when a turn errors', async () => {
    const sm = makeSessionManager([{ text: '', outcome: 'error' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    expect(sm.flipToHumanReview).not.toHaveBeenCalled()
    expect(sm.unmarkAutoPilot).toHaveBeenCalledWith('sess-1')
  })

  it('stops without flip when canceled', async () => {
    const sm = makeSessionManager([{ text: '', outcome: 'canceled' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    expect(sm.flipToHumanReview).not.toHaveBeenCalled()
  })

  it('appends the sentinel protocol to the first-turn prompt and sets auto mode', async () => {
    const sm = makeSessionManager([{ text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    const sent = sm.startPrompt.mock.calls[0]![0]
    expect(sent.prompt).toContain('do it')
    expect(sent.prompt).toContain('AUTOPILOT: COMPLETE')
    expect(sm.setPermissionMode).toHaveBeenCalledWith('sess-1', 'auto')
  })

  it('broadcasts per-turn progress', async () => {
    const sm = makeSessionManager([{ text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }])
    const broadcast = vi.fn()
    const runner = createAutoPilotRunner({ sessionManager: sm as never, broadcast })
    await runner.run(opts)
    expect(broadcast).toHaveBeenCalledWith(
      'acp:autopilot-progress',
      expect.objectContaining({ taskId: 'task-1', sessionId: 'sess-1', turn: 1, maxTurns: 5 }),
      'task-1'
    )
  })
})
