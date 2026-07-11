type PermissionOption = { optionId: string; name: string; kind: string }
type RequestPermissionParams = {
  options: PermissionOption[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

// Why: this flat shape is the SDK's inner `RequestPermissionOutcome`. The ACP
// client (task 11) wraps it as `{ outcome }` to form the full RequestPermissionResponse.
export type PermissionOutcome = { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' }

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

type PendingEntry = {
  sessionId: string
  resolve: (o: PermissionOutcome) => void
}

let requestSeq = 0

function firstAllowOptionId(options: PermissionOption[]): string | undefined {
  const allow = options.find((o) => o.kind.startsWith('allow'))
  return (allow ?? options[0])?.optionId
}

export class AcpPermissionBridge {
  private pending = new Map<string, PendingEntry>()
  private readonly autoAllow: boolean

  constructor(
    private readonly broadcast: BroadcastFn,
    opts: { autoAllow?: boolean } = {}
  ) {
    this.autoAllow = opts.autoAllow ?? true
  }

  requestPermission(
    sessionId: string,
    params: RequestPermissionParams
  ): Promise<PermissionOutcome> {
    const requestId = `perm-${++requestSeq}`
    return new Promise<PermissionOutcome>((resolve) => {
      this.pending.set(requestId, { sessionId, resolve })
      this.broadcast('acp:permission-request', { requestId, sessionId, params }, sessionId)
      if (this.autoAllow) {
        const optionId = firstAllowOptionId(params.options)
        if (optionId) {
          this.resolvePermission(requestId, optionId)
        }
      }
    })
  }

  resolvePermission(requestId: string, optionId: string): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) {
      return false
    }
    this.pending.delete(requestId)
    entry.resolve({ outcome: 'selected', optionId })
    return true
  }

  rejectAllForSession(sessionId: string): void {
    for (const [id, entry] of this.pending.entries()) {
      if (entry.sessionId === sessionId) {
        this.pending.delete(id)
        entry.resolve({ outcome: 'cancelled' })
      }
    }
  }
}
