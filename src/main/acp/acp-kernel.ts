import { AcpConnectionPool, type PoolDeps } from './acp-connection-pool'
import { AcpPermissionBridge } from './acp-permission-bridge'
import { AcpSessionManager } from './acp-session-manager'
import { createExecuteRouter } from './acp-execute-router'
import { createAutoPilotRunner } from './acp-autopilot-runner'

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type BuildAcpKernelDeps = {
  acpSessions: ConstructorParameters<typeof AcpSessionManager>[0]['acpSessions']
  todos: ConstructorParameters<typeof AcpSessionManager>[0]['todos']
  broadcast: BroadcastFn
  now: () => string
  /** Test-only overrides for connect/buildClient; production omits this. */
  pool?: Pick<PoolDeps, 'connect' | 'buildClient'>
}

// Assembles the ACP kernel from injected repositories so it stays electron-free
// and unit-testable; runtime supplies the real repos + broadcast.
export function buildAcpKernel(deps: BuildAcpKernelDeps) {
  const permissionBridge = new AcpPermissionBridge(deps.broadcast)
  // Why: pool must share broadcast + permissionBridge — otherwise sessionUpdate
  // is cached but never sent to the renderer, and tool permissions always cancel.
  const connectionPool = new AcpConnectionPool({
    ...deps.pool,
    broadcast: deps.broadcast,
    requestPermission: (sessionId, params) => permissionBridge.requestPermission(sessionId, params)
  })
  const sessionManager = new AcpSessionManager({
    connectionPool: connectionPool as never,
    acpSessions: deps.acpSessions,
    todos: deps.todos,
    permissionBridge: permissionBridge as never,
    broadcast: deps.broadcast,
    now: deps.now
  })
  const autoPilotRunner = createAutoPilotRunner({
    sessionManager,
    broadcast: deps.broadcast
  })
  const executeRouter = createExecuteRouter({ sessionManager, autoPilotRunner })
  return { connectionPool, permissionBridge, sessionManager, executeRouter, autoPilotRunner }
}
