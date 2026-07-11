import { AcpConnectionPool } from './acp-connection-pool'
import { AcpPermissionBridge } from './acp-permission-bridge'
import { AcpSessionManager } from './acp-session-manager'
import { createExecuteRouter } from './acp-execute-router'

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type BuildAcpKernelDeps = {
  acpSessions: ConstructorParameters<typeof AcpSessionManager>[0]['acpSessions']
  todos: ConstructorParameters<typeof AcpSessionManager>[0]['todos']
  broadcast: BroadcastFn
  now: () => string
}

// Assembles the ACP kernel from injected repositories so it stays electron-free
// and unit-testable; runtime supplies the real repos + broadcast.
export function buildAcpKernel(deps: BuildAcpKernelDeps) {
  const connectionPool = new AcpConnectionPool()
  const permissionBridge = new AcpPermissionBridge(deps.broadcast)
  const sessionManager = new AcpSessionManager({
    connectionPool: connectionPool as never,
    acpSessions: deps.acpSessions,
    todos: deps.todos,
    permissionBridge: permissionBridge as never,
    broadcast: deps.broadcast,
    now: deps.now
  })
  const executeRouter = createExecuteRouter({ sessionManager })
  return { connectionPool, permissionBridge, sessionManager, executeRouter }
}
