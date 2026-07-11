// P2a 首批引擎;新增引擎 = 往这里加一项 + launcher 加 spec。
export const ACP_ENGINES = ['claude', 'qoder', 'cursor'] as const
export type AcpEngine = (typeof ACP_ENGINES)[number]

export function isAcpEngine(value: string): value is AcpEngine {
  return (ACP_ENGINES as readonly string[]).includes(value)
}

export type AcpSessionStatus = 'running' | 'completed' | 'error' | 'canceled'

export type AcpSessionRecord = {
  id: string
  taskId: string
  engine: AcpEngine
  sessionId: string
  cwd: string
  status: AcpSessionStatus
  stopReason: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export type CreateAcpSessionInput = {
  taskId: string
  engine: AcpEngine
  sessionId: string
  cwd: string
}

export type StartPromptOptions = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  resumeSessionId?: string
}

export type StartPromptResult = {
  sessionId: string
}

export type AcpTaskOutcome = {
  taskId: string
  sessionId: string
  result: 'error' | 'canceled'
}

// 结构化连接接口:session-manager 依赖它,既能被 fake 测试,
// 也能由 connection-pool 返回的 SDK 连接结构化满足。
export type AcpConnection = {
  newSession(params: { cwd: string; mcpServers: [] }): Promise<AcpNewSessionResult>
  resumeSession(params: { sessionId: string; cwd: string }): Promise<AcpNewSessionResult>
  loadSession(params: { sessionId: string; cwd: string }): Promise<unknown>
  prompt(params: {
    sessionId: string
    prompt: { type: 'text'; text: string }[]
  }): Promise<{ stopReason: string }>
  cancel(params: { sessionId: string }): Promise<void>
  setSessionMode?(params: { sessionId: string; modeId: string }): Promise<void>
}

export type AcpNewSessionResult = {
  sessionId: string
  modes?: { currentModeId?: string; availableModes?: { id: string }[] } | null
  models?: unknown
}
