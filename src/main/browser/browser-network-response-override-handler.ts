import type { WebContents } from 'electron'
import {
  matchesBrowserNetworkUrlPattern,
  type BrowserNetworkRule
} from '../../shared/browser-network-rule'
import { buildCdpFulfillPayload } from './browser-network-fulfill-payload'
import { sendDebuggerCommand } from './browser-screencast-debugger-command'

type BrowserNetworkResponseOverrideHandlerDeps = {
  dbg: WebContents['debugger']
  rulesFor: () => BrowserNetworkRule[]
  onError?: (message: string) => void
}

// Why not matchesBrowserNetworkRule: overrides deliberately ignore resourceTypes, because CDP's
// resource vocabulary does not map onto Electron's and an approximate mapping would silently miss.
export function findResponseOverrideRule(
  rules: BrowserNetworkRule[],
  facts: { url: string; method: string }
): BrowserNetworkRule | null {
  for (const rule of rules) {
    if (!rule.enabled || !rule.responseOverride) {
      continue
    }
    if (!matchesBrowserNetworkUrlPattern(rule.match.urlPattern, facts.url)) {
      continue
    }
    const methods = rule.match.methods
    if (methods && methods.length > 0) {
      const method = facts.method.toUpperCase()
      if (!methods.some((candidate) => candidate.toUpperCase() === method)) {
        continue
      }
    }
    return rule
  }
  return null
}

async function continuePausedResponse(
  dbg: WebContents['debugger'],
  requestId: string,
  onError?: (message: string) => void
): Promise<void> {
  try {
    await sendDebuggerCommand(dbg, 'Fetch.continueResponse', { requestId })
  } catch (error) {
    onError?.(error instanceof Error ? error.message : 'Failed to continue a paused request.')
  }
}

export function createBrowserNetworkResponseOverrideHandler(
  deps: BrowserNetworkResponseOverrideHandlerDeps
): (event: unknown, method: string, params: unknown) => void {
  const { dbg, rulesFor, onError } = deps

  return (_event: unknown, method: string, params: unknown): void => {
    if (method !== 'Fetch.requestPaused') {
      return
    }
    const payload = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
    if (!requestId) {
      return
    }
    const request =
      payload.request && typeof payload.request === 'object'
        ? (payload.request as Record<string, unknown>)
        : {}
    const url = typeof request.url === 'string' ? request.url : ''
    const requestMethod = typeof request.method === 'string' ? request.method : 'GET'

    // Every branch below answers the pause exactly once: an unanswered pause hangs the page.
    let rule: BrowserNetworkRule | null = null
    try {
      rule = findResponseOverrideRule(rulesFor(), { url, method: requestMethod })
    } catch {
      rule = null
    }
    const override = rule?.responseOverride
    if (!override) {
      void continuePausedResponse(dbg, requestId, onError)
      return
    }
    let fulfill
    try {
      fulfill = buildCdpFulfillPayload(requestId, override)
    } catch {
      void continuePausedResponse(dbg, requestId, onError)
      return
    }
    void sendDebuggerCommand(dbg, 'Fetch.fulfillRequest', fulfill).catch(() => {
      void continuePausedResponse(dbg, requestId, onError)
    })
  }
}
