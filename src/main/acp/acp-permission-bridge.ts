type PermissionOption = { optionId: string; name: string; kind: string }
type RequestPermissionParams = {
  options: PermissionOption[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

// Why: this flat shape is the SDK's inner `RequestPermissionOutcome`. The ACP
// client wraps it as `{ outcome }` to form the full RequestPermissionResponse.
export type PermissionOutcome = { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' }

export type PermissionMode = 'auto' | 'ask'

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

type PendingEntry = {
  sessionId: string
  resolve: (o: PermissionOutcome) => void
  timer?: ReturnType<typeof setTimeout>
}

let requestSeq = 0
const DEFAULT_ASK_TIMEOUT_MS = 120_000

function firstAllowOptionId(options: PermissionOption[]): string | undefined {
  const allow = options.find((o) => o.kind.startsWith('allow'))
  return (allow ?? options[0])?.optionId
}

export class AcpPermissionBridge {
  private pending = new Map<string, PendingEntry>()
  private modeBySession = new Map<string, PermissionMode>()
  private readonly autoAllow: boolean
  private readonly askTimeoutMs: number

  constructor(
    private readonly broadcast: BroadcastFn,
    opts: { autoAllow?: boolean; askTimeoutMs?: number } = {}
  ) {
    this.autoAllow = opts.autoAllow ?? true
    this.askTimeoutMs = opts.askTimeoutMs ?? DEFAULT_ASK_TIMEOUT_MS
  }

  setPermissionMode(sessionId: string, mode: PermissionMode): void {
    this.modeBySession.set(sessionId, mode)
  }

  private modeFor(sessionId: string): PermissionMode {
    return this.modeBySession.get(sessionId) ?? (this.autoAllow ? 'auto' : 'ask')
  }

  requestPermission(
    sessionId: string,
    params: RequestPermissionParams
  ): Promise<PermissionOutcome> {
    const requestId = `perm-${++requestSeq}`
    return new Promise<PermissionOutcome>((resolve) => {
      const entry: PendingEntry = { sessionId, resolve }
      this.pending.set(requestId, entry)
      this.broadcast('acp:permission-request', { requestId, sessionId, params }, sessionId)
      if (this.modeFor(sessionId) === 'auto') {
        const optionId = firstAllowOptionId(params.options)
        if (optionId) {
          this.resolvePermission(requestId, optionId)
        }
        return
      }
      // ask 模式:挂起,超时默认拒绝并清理,避免 agent 永久阻塞。
      entry.timer = setTimeout(() => {
        if (this.pending.delete(requestId)) {
          resolve({ outcome: 'cancelled' })
        }
      }, this.askTimeoutMs)
    })
  }

  resolvePermission(requestId: string, optionId: string): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) {
      return false
    }
    this.pending.delete(requestId)
    if (entry.timer) {
      clearTimeout(entry.timer)
    }
    entry.resolve({ outcome: 'selected', optionId })
    return true
  }

  rejectAllForSession(sessionId: string): void {
    for (const [id, entry] of this.pending.entries()) {
      if (entry.sessionId === sessionId) {
        this.pending.delete(id)
        if (entry.timer) {
          clearTimeout(entry.timer)
        }
        entry.resolve({ outcome: 'cancelled' })
      }
    }
  }
}
