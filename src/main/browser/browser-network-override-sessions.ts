import type { WebContents } from 'electron'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import {
  overrideRulesOf,
  type BrowserNetworkOverrideSession,
  type startBrowserNetworkOverrides
} from './browser-network-response-override'

export type BrowserNetworkOverrideSyncResult = { ok: boolean; message?: string }

export type BrowserNetworkOverrideSessions = {
  sync: (
    browserPageId: string,
    rules: BrowserNetworkRule[]
  ) => Promise<BrowserNetworkOverrideSyncResult>
  close: (browserPageId: string) => void
}

type BrowserNetworkOverrideSessionsDeps = {
  resolveWebContents: (browserPageId: string) => WebContents | null
  start: typeof startBrowserNetworkOverrides
}

export function createBrowserNetworkOverrideSessions(
  deps: BrowserNetworkOverrideSessionsDeps
): BrowserNetworkOverrideSessions {
  const { resolveWebContents, start } = deps
  const sessions = new Map<string, BrowserNetworkOverrideSession>()

  const close = (browserPageId: string): void => {
    const session = sessions.get(browserPageId)
    if (!session) {
      return
    }
    sessions.delete(browserPageId)
    session.close()
  }

  const sync = async (
    browserPageId: string,
    rules: BrowserNetworkRule[]
  ): Promise<BrowserNetworkOverrideSyncResult> => {
    if (overrideRulesOf(rules).length === 0) {
      // Interception is not free, so a page with no override pays nothing for one.
      close(browserPageId)
      return { ok: true }
    }
    const existing = sessions.get(browserPageId)
    if (existing) {
      try {
        await existing.update(rules)
        return { ok: true }
      } catch (error) {
        // Forget the broken session so the next sync builds a fresh one.
        close(browserPageId)
        return { ok: false, message: error instanceof Error ? error.message : undefined }
      }
    }
    const webContents = resolveWebContents(browserPageId)
    if (!webContents) {
      return { ok: false, message: 'Browser tab is no longer available' }
    }
    try {
      sessions.set(browserPageId, await start(webContents, rules))
      return { ok: true }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : undefined }
    }
  }

  return { sync, close }
}
