import type { TodoItem } from '../../shared/todo/todo-item'
import type { TodoStatus } from '../../shared/todo/todo-status'
import type { AcpEngine } from '../../shared/acp/acp-session'
import { ACP_ENGINES } from '../../shared/acp/acp-session'
import type { TodoOrchestratorConfig } from '../../shared/todo/todo-orchestrator-config'
import { buildBasePrompt } from '../../shared/todo/todo-base-prompt'
import { sortAutoPilotCandidates } from './todo-orchestrator-candidate-order'

export type OrchestratorDispatchInput = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  autoPilot: { maxTurns: number }
}

export type OrchestratorDeps = {
  listCandidates: () => TodoItem[]
  updateStatus: (id: string, status: TodoStatus) => void
  resolveCwd: (item: TodoItem) => string | null
  dispatch: (input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>
  getConfig: () => TodoOrchestratorConfig
}

export class TodoOrchestratorService {
  private readonly deps: OrchestratorDeps
  private timer: ReturnType<typeof setInterval> | null = null
  private evaluating = false
  // Why: slots are counted by in-flight dispatch promises, not task status, so a
  // crash-orphaned in_progress row never occupies a slot (design §2 recovery).
  private readonly liveSessions = new Set<string>()

  constructor(deps: OrchestratorDeps) {
    this.deps = deps
  }

  start(): void {
    if (this.timer) {
      return
    }
    const { tickMs } = this.deps.getConfig()
    this.timer = setInterval(() => {
      void this.tick()
    }, tickMs)
    void this.tick()
  }

  stop(): void {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (this.evaluating) {
      return
    }
    this.evaluating = true
    try {
      const cfg = this.deps.getConfig()
      if (!cfg.enabled) {
        return
      }
      const slots = cfg.maxConcurrent - this.liveSessions.size
      if (slots <= 0) {
        return
      }
      const candidates = sortAutoPilotCandidates(
        this.deps.listCandidates().filter((c) => !this.liveSessions.has(c.id))
      ).slice(0, slots)
      for (const candidate of candidates) {
        const cwd = this.deps.resolveCwd(candidate)
        if (!cwd) {
          // Not launchable yet (no ready host / no default dir) — retry next tick.
          continue
        }
        this.liveSessions.add(candidate.id)
        const engine: AcpEngine = candidate.preferredAgent ?? ACP_ENGINES[0]
        // Why: autoPilotRunner.run() resolves only at loop-end, so this promise's
        // lifetime == one AutoPilot run. Free the slot on either settle path and
        // re-evaluate to refill it. On reject the task stays in_progress for a human
        // (no auto-retry); .then(cb, cb) swallows the rejection so a dispatch failure
        // never surfaces as an unhandled rejection.
        const release = (): void => {
          this.liveSessions.delete(candidate.id)
          void this.tick()
        }
        // Why: reserve the slot, flip status, and dispatch as one unit. A synchronous
        // throw from updateStatus (e.g. the row was deleted mid-tick) must free the
        // reservation, or the slot leaks permanently and maxConcurrent erodes to 0.
        try {
          this.deps.updateStatus(candidate.id, 'in_progress')
          void this.deps
            .dispatch({
              taskId: candidate.id,
              engine,
              prompt: buildBasePrompt(candidate),
              cwd,
              autoPilot: { maxTurns: candidate.autoPilotMaxTurns ?? cfg.defaultMaxTurns }
            })
            .then(release, release)
        } catch {
          this.liveSessions.delete(candidate.id)
        }
      }
    } finally {
      this.evaluating = false
    }
  }
}
