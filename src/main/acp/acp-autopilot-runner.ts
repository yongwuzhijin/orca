import type { StartPromptOptions, StartPromptResult } from '../../shared/acp/acp-session'
import {
  parseAutoPilotVerdict,
  composeContinuation,
  AUTOPILOT_PROTOCOL,
  type AutoPilotVerdict
} from './autopilot-verdict'

type RunnerSessionManager = {
  startPrompt: (opts: StartPromptOptions) => Promise<StartPromptResult>
  promptExisting: (sessionId: string, prompt: string) => Promise<void>
  waitForPrompt: (sessionId: string) => Promise<void>
  readLastTurnText: (sessionId: string) => string
  readLastOutcome: (sessionId: string) => 'completed' | 'error' | 'canceled' | undefined
  markAutoPilot: (sessionId: string) => void
  unmarkAutoPilot: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: 'auto' | 'ask') => void
  flipToHumanReview: (taskId: string) => void
}

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type AutoPilotRunnerDeps = {
  sessionManager: RunnerSessionManager
  parseVerdict?: (text: string) => AutoPilotVerdict
  broadcast?: BroadcastFn
}

type AutoPilotRunOptions = StartPromptOptions & { autoPilot: { maxTurns: number } }

export function createAutoPilotRunner(deps: AutoPilotRunnerDeps) {
  const parseVerdict = deps.parseVerdict ?? parseAutoPilotVerdict
  const broadcast = deps.broadcast ?? ((): void => {})
  const sm = deps.sessionManager

  return {
    async run(opts: AutoPilotRunOptions): Promise<StartPromptResult> {
      const maxTurns = Math.max(1, Math.floor(opts.autoPilot.maxTurns))
      const firstPrompt = `${opts.prompt}${AUTOPILOT_PROTOCOL}`
      const { sessionId } = await sm.startPrompt({ ...opts, prompt: firstPrompt })
      // startPrompt already marks autoPilot when opts.autoPilot is set; mark again
      // defensively and force auto approval for the unattended loop.
      sm.markAutoPilot(sessionId)
      sm.setPermissionMode(sessionId, 'auto')

      let turn = 1
      try {
        for (;;) {
          await sm.waitForPrompt(sessionId)
          const outcome = sm.readLastOutcome(sessionId)
          broadcast(
            'acp:autopilot-progress',
            { taskId: opts.taskId, sessionId, turn, maxTurns },
            opts.taskId
          )
          if (outcome === 'error' || outcome === 'canceled') {
            return { sessionId }
          }
          const verdict = parseVerdict(sm.readLastTurnText(sessionId))
          if (verdict.status === 'complete' || turn >= maxTurns) {
            sm.flipToHumanReview(opts.taskId)
            return { sessionId }
          }
          turn++
          await sm.promptExisting(sessionId, composeContinuation(verdict.remaining))
        }
      } finally {
        sm.unmarkAutoPilot(sessionId)
      }
    }
  }
}

export type AutoPilotRunner = ReturnType<typeof createAutoPilotRunner>
