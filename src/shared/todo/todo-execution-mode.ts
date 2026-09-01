/** ACP engines available when starting a todo in ACP mode. */
export const TODO_ACP_ENGINES = ['cursor', 'qoder'] as const
export type TodoAcpEngine = (typeof TODO_ACP_ENGINES)[number]

export type TodoExecutionMode = 'acp' | 'terminal'

export function isTodoExecutionMode(value: string): value is TodoExecutionMode {
  return value === 'acp' || value === 'terminal'
}

export function isTodoAcpEngine(value: string): value is TodoAcpEngine {
  return (TODO_ACP_ENGINES as readonly string[]).includes(value)
}
