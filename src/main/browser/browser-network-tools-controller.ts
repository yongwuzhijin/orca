import { app, webContents } from 'electron'
import { join } from 'node:path'
import type { Session } from 'electron'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import type { BrowserNetworkLogRead } from '../../shared/browser-network-log-types'
import { browserManager } from './browser-manager'
import { createBrowserNetworkArmedRules } from './browser-network-armed-rules'
import { createBrowserNetworkOverrideSessions } from './browser-network-override-sessions'
import { createBrowserNetworkRequestLog } from './browser-network-request-log'
import { startBrowserNetworkOverrides } from './browser-network-response-override'
import {
  BROWSER_NETWORK_RULES_FILE_NAME,
  loadBrowserNetworkRules,
  persistBrowserNetworkRules
} from './browser-network-rule-store'
import {
  setBrowserCompletedStage,
  setBrowserErrorStage,
  setBrowserRequestHeadersStage,
  setBrowserResponseHeadersStage
} from './browser-session-request-pipeline'

export type BrowserNetworkArmResult = {
  armed: boolean
  reason?: 'no_guest' | 'unknown_rules' | 'cdp_error'
}

const resolveRulesPath = (): string =>
  join(app.getPath('userData'), BROWSER_NETWORK_RULES_FILE_NAME)
const resolvePageId = (webContentsId: number): string | null =>
  browserManager.resolveBrowserPageIdForGuestWebContentsId(webContentsId)

const armedRules = createBrowserNetworkArmedRules(resolvePageId)
const requestLog = createBrowserNetworkRequestLog(resolvePageId)
const overrideSessions = createBrowserNetworkOverrideSessions({
  resolveWebContents: (browserPageId) => {
    const id = browserManager.getGuestWebContentsId(browserPageId)
    return id === null ? null : (webContents.fromId(id) ?? null)
  },
  start: startBrowserNetworkOverrides
})

let cachedRules: BrowserNetworkRule[] | null = null

export function listBrowserNetworkRules(): BrowserNetworkRule[] {
  cachedRules ??= loadBrowserNetworkRules(resolveRulesPath)
  return [...cachedRules]
}

export function saveBrowserNetworkRules(rules: BrowserNetworkRule[]): boolean {
  if (!persistBrowserNetworkRules(resolveRulesPath, rules)) {
    return false
  }
  cachedRules = [...rules]
  // Why: an edit to an already-armed rule must take effect without a re-arm round trip.
  for (const browserPageId of armedRules.armedPageIds()) {
    const armedIds = new Set(armedRules.rulesFor(browserPageId).map((rule) => rule.id))
    armedRules.arm(
      browserPageId,
      rules.filter((rule) => armedIds.has(rule.id))
    )
    // Fire and forget: sync never rejects, and a failed re-sync must not fail the save.
    void overrideSessions.sync(
      browserPageId,
      rules.filter((rule) => armedIds.has(rule.id))
    )
  }
  return true
}

export async function armBrowserNetworkRules(
  browserPageId: string,
  ruleIds: string[]
): Promise<BrowserNetworkArmResult> {
  if (!browserManager.hasRegisteredGuestForBrowserPage(browserPageId)) {
    return { armed: false, reason: 'no_guest' }
  }
  const byId = new Map(listBrowserNetworkRules().map((rule) => [rule.id, rule]))
  const resolved = ruleIds
    .map((id) => byId.get(id))
    .filter((rule): rule is BrowserNetworkRule => !!rule)
  if (resolved.length !== ruleIds.length) {
    return { armed: false, reason: 'unknown_rules' }
  }
  // Install the interception first: arming an override that is not actually installed is worse
  // than refusing to arm, because the page would look overridden and behave normally.
  if (!(await overrideSessions.sync(browserPageId, resolved)).ok) {
    return { armed: false, reason: 'cdp_error' }
  }
  armedRules.arm(browserPageId, resolved)
  return { armed: true }
}

export function disarmBrowserNetworkRules(browserPageId: string): boolean {
  armedRules.disarm(browserPageId)
  overrideSessions.close(browserPageId)
  return true
}

export function armedBrowserNetworkRuleIds(browserPageId: string): string[] {
  return armedRules.rulesFor(browserPageId).map((rule) => rule.id)
}

export function readBrowserNetworkLog(browserPageId: string, limit: number): BrowserNetworkLogRead {
  return requestLog.read(browserPageId, limit)
}

export function handleBrowserNetworkGuestDestroyed(browserPageId: string): void {
  armedRules.disarm(browserPageId)
  overrideSessions.close(browserPageId)
  requestLog.clear(browserPageId)
}

export function installBrowserNetworkToolsStages(sess: Session): void {
  setBrowserRequestHeadersStage(sess, 'network-rules', armedRules.requestHeadersStage)
  setBrowserResponseHeadersStage(sess, 'network-rules', armedRules.responseHeadersStage)
  // Why: the log records but never mutates, so its stages ignore the headers argument.
  setBrowserRequestHeadersStage(sess, 'request-log', (details) => {
    requestLog.recordStart(details)
  })
  setBrowserResponseHeadersStage(sess, 'request-log', (details) => {
    requestLog.recordResponseHeaders(details)
  })
  setBrowserCompletedStage(sess, 'request-log', (details) => {
    requestLog.recordCompletion(details)
  })
  setBrowserErrorStage(sess, 'request-log', (details) => {
    requestLog.recordError(details)
  })
}
