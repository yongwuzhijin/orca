import { promises as fs } from 'node:fs'
import type { AcpEngine } from '../../shared/acp/acp-session'
import type { PermissionOutcome } from './acp-permission-bridge'

type SessionNotification = { sessionId: string; update: unknown }

type RequestPermissionRequest = {
  sessionId: string
  options: { optionId: string; name: string; kind: string }[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

type RequestPermissionResponse = { outcome: PermissionOutcome }

export type OrcaAcpClientDeps = {
  onSessionUpdate: (notif: SessionNotification) => void
  requestPermission: (
    sessionId: string,
    params: {
      options: RequestPermissionRequest['options']
      toolCall: RequestPermissionRequest['toolCall']
    }
  ) => Promise<PermissionOutcome>
}

// Why: Client side of ACP — handles inbound Agent→Client callbacks only.
export class OrcaAcpClient {
  constructor(
    private readonly _engine: AcpEngine,
    private readonly deps: OrcaAcpClientDeps
  ) {}

  // Why: engine is stored for future per-engine behavior (P2b); expose it so the
  // field is a genuine read rather than a dead parameter property.
  get engine(): AcpEngine {
    return this._engine
  }

  async sessionUpdate(notif: SessionNotification): Promise<void> {
    this.deps.onSessionUpdate(notif)
  }

  // Why: SDK's RequestPermissionResponse nests the outcome; the bridge returns
  // the inner (flat) outcome, so wrap it here to satisfy the ACP wire contract.
  async requestPermission(req: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const outcome = await this.deps.requestPermission(req.sessionId, {
      options: req.options,
      toolCall: req.toolCall
    })
    return { outcome }
  }

  async readTextFile(req: { path: string }): Promise<{ content: string }> {
    const content = await fs.readFile(req.path, 'utf8')
    return { content }
  }

  // Why: SDK WriteTextFileResponse is an (all-optional) object, not void — return
  // {} so the client stays structurally assignable to the SDK Client type.
  async writeTextFile(req: { path: string; content: string }): Promise<Record<string, never>> {
    await fs.writeFile(req.path, req.content, 'utf8')
    return {}
  }
}
