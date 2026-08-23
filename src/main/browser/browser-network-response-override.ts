import type { WebContents } from 'electron'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import { toCdpUrlPattern } from './browser-network-cdp-url-pattern'
import { createBrowserNetworkResponseOverrideHandler } from './browser-network-response-override-handler'
import { sendDebuggerCommand } from './browser-screencast-debugger-command'
import { acquireElectronDebugger, type ElectronDebuggerLease } from './electron-debugger-lease'

// Same wording as cdp-debugger-channel.ts and browser-screencast-stream.ts: attach loses to DevTools.
export const BROWSER_OVERRIDE_ATTACH_FAILED =
  'Could not attach debugger. DevTools may already be open for this tab.'

export type BrowserNetworkOverrideSession = {
  update: (rules: BrowserNetworkRule[]) => Promise<void>
  close: () => void
}

// Why the Request stage and not Response: at the Response stage Chromium silently ignores
// fulfillRequest's responseCode and responseHeaders, replacing only the body — so an override kept
// the upstream status and leaked upstream headers. The Request stage synthesizes the whole response
// and spares the network round trip the answer never uses.
type CdpOverridePattern = { urlPattern: string; requestStage: 'Request' }

export function overrideRulesOf(rules: BrowserNetworkRule[]): BrowserNetworkRule[] {
  return rules.filter((rule) => rule.enabled && !!rule.responseOverride)
}

function cdpPatterns(rules: BrowserNetworkRule[]): CdpOverridePattern[] {
  const seen = new Set<string>()
  const patterns: CdpOverridePattern[] = []
  for (const rule of rules) {
    const urlPattern = toCdpUrlPattern(rule.match.urlPattern)
    if (seen.has(urlPattern)) {
      continue
    }
    seen.add(urlPattern)
    patterns.push({ urlPattern, requestStage: 'Request' })
  }
  return patterns
}

export async function startBrowserNetworkOverrides(
  webContents: WebContents,
  rules: BrowserNetworkRule[]
): Promise<BrowserNetworkOverrideSession> {
  let lease: ElectronDebuggerLease
  try {
    lease = acquireElectronDebugger(webContents)
  } catch {
    throw new Error(BROWSER_OVERRIDE_ATTACH_FAILED)
  }

  const dbg = webContents.debugger
  let current = overrideRulesOf(rules)
  let closed = false
  // Why the closure over `current`: the handler must see the live rule set, since a save can edit
  // an armed rule and the pause has to be decided against what is armed now.
  const handleMessage = createBrowserNetworkResponseOverrideHandler({
    dbg,
    rulesFor: () => current
  })
  dbg.on('message', handleMessage as never)

  const close = (): void => {
    if (closed) {
      return
    }
    closed = true
    dbg.removeListener('message', handleMessage as never)
    // Best effort: a destroyed tab cannot answer, and the lease detach settles it either way.
    void sendDebuggerCommand(dbg, 'Fetch.disable').catch(() => {})
    lease.release()
  }

  try {
    await sendDebuggerCommand(dbg, 'Fetch.enable', { patterns: cdpPatterns(current) })
  } catch (error) {
    close()
    throw new Error(
      error instanceof Error ? error.message : 'Failed to enable browser response overrides.'
    )
  }

  return {
    update: async (next: BrowserNetworkRule[]): Promise<void> => {
      if (closed) {
        return
      }
      current = overrideRulesOf(next)
      await sendDebuggerCommand(dbg, 'Fetch.enable', { patterns: cdpPatterns(current) })
    },
    close
  }
}
