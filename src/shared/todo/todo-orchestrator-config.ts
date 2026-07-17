export type TodoOrchestratorConfig = {
  /** Master switch. Off by default — autonomous runs spend tokens and change code. */
  enabled: boolean
  /** Global concurrent AutoPilot dispatches. */
  maxConcurrent: number
  /** Poll cadence in ms. */
  tickMs: number
  /** Fallback continuation cap when a task's autoPilotMaxTurns is null. */
  defaultMaxTurns: number
}

export const DEFAULT_TODO_ORCHESTRATOR_CONFIG: TodoOrchestratorConfig = {
  enabled: false,
  maxConcurrent: 2,
  tickMs: 15_000,
  defaultMaxTurns: 10
}
