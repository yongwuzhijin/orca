import { isAcpEngine } from '../../shared/acp/acp-session'
import type { StartPromptOptions, StartPromptResult } from '../../shared/acp/acp-session'

export class EngineFallbackNotWired extends Error {
  constructor(engine: string) {
    super(`PTY fallback for engine "${engine}" is not wired in P2a`)
    this.name = 'EngineFallbackNotWired'
  }
}

type SessionManagerLike = {
  startPrompt: (opts: StartPromptOptions) => Promise<StartPromptResult>
}

type AutoPilotRunnerLike = {
  run: (
    opts: StartPromptOptions & { autoPilot: { maxTurns: number } }
  ) => Promise<StartPromptResult>
}

export function createExecuteRouter(deps: {
  sessionManager: SessionManagerLike
  autoPilotRunner?: AutoPilotRunnerLike
}) {
  return {
    async executeEnginePrompt(opts: StartPromptOptions): Promise<StartPromptResult> {
      // claude/qoder speak ACP; other engines have no PTY fallback in P2a, so fail loud.
      if (isAcpEngine(opts.engine)) {
        // autoPilot 存在时走续接循环 runner，否则单轮 startPrompt。
        if (opts.autoPilot && deps.autoPilotRunner) {
          return deps.autoPilotRunner.run({ ...opts, autoPilot: opts.autoPilot })
        }
        return deps.sessionManager.startPrompt(opts)
      }
      throw new EngineFallbackNotWired(String(opts.engine))
    }
  }
}
