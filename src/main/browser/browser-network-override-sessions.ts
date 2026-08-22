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
  const queues = new Map<string, Promise<void>>()

  // Without this queue two overlapping syncs both miss the map across `await start` and the loser
  // stays live but unreachable (lease held, interception armed), and a close during an in-flight
  // start misses the session the start is about to store. The tail is always non-rejecting so one
  // failure cannot poison later operations on the page.
  const enqueue = <T>(browserPageId: string, operation: () => Promise<T>): Promise<T> => {
    const result = (queues.get(browserPageId) ?? Promise.resolve()).then(operation)
    const tail = result.then(
      () => {},
      () => {}
    )
    queues.set(browserPageId, tail)
    void tail.then(() => {
      if (queues.get(browserPageId) === tail) {
        queues.delete(browserPageId)
      }
    })
    return result
  }

  const closeNow = (browserPageId: string): void => {
    const session = sessions.get(browserPageId)
    if (!session) {
      return
    }
    sessions.delete(browserPageId)
    session.close()
  }

  const close = (browserPageId: string): void => {
    void enqueue(browserPageId, async () => closeNow(browserPageId)).catch(() => {})
  }

  const syncNow = async (
    browserPageId: string,
    rules: BrowserNetworkRule[]
  ): Promise<BrowserNetworkOverrideSyncResult> => {
    if (overrideRulesOf(rules).length === 0) {
      // Interception is not free, so a page with no override pays nothing for one.
      closeNow(browserPageId)
      return { ok: true }
    }
    const existing = sessions.get(browserPageId)
    if (existing) {
      try {
        await existing.update(rules)
        return { ok: true }
      } catch (error) {
        // Forget the broken session so the next sync builds a fresh one.
        closeNow(browserPageId)
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

  const sync = (
    browserPageId: string,
    rules: BrowserNetworkRule[]
  ): Promise<BrowserNetworkOverrideSyncResult> =>
    enqueue(browserPageId, () => syncNow(browserPageId, rules)).catch((error: unknown) => ({
      ok: false,
      message: error instanceof Error ? error.message : undefined
    }))

  return { sync, close }
}
