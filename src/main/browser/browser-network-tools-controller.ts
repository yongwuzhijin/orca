import { app } from 'electron'
import { join } from 'node:path'
import type { Session } from 'electron'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import type { BrowserNetworkLogRead } from '../../shared/browser-network-log-types'
import { browserManager } from './browser-manager'
import { createBrowserNetworkArmedRules } from './browser-network-armed-rules'
import { createBrowserNetworkRequestLog } from './browser-network-request-log'
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

export type BrowserNetworkArmResult = { armed: boolean; reason?: 'no_guest' | 'unknown_rules' }

const resolveRulesPath = (): string =>
  join(app.getPath('userData'), BROWSER_NETWORK_RULES_FILE_NAME)
const resolvePageId = (webContentsId: number): string | null =>
  browserManager.resolveBrowserPageIdForGuestWebContentsId(webContentsId)

const armedRules = createBrowserNetworkArmedRules(resolvePageId)
const requestLog = createBrowserNetworkRequestLog(resolvePageId)

let cachedRules: BrowserNetworkRule[] | null = null

export function listBrowserNetworkRules(): BrowserNetworkRule[] {
  cachedRules ??= loadBrowserNetworkRules(resolveRulesPath)
  return cachedRules
}

export function saveBrowserNetworkRules(rules: BrowserNetworkRule[]): boolean {
  if (!persistBrowserNetworkRules(resolveRulesPath, rules)) {
    return false
  }
  cachedRules = rules
  // Why: an edit to an already-armed rule must take effect without a re-arm round trip.
  for (const browserPageId of armedRules.armedPageIds()) {
    const armedIds = new Set(armedRules.rulesFor(browserPageId).map((rule) => rule.id))
    armedRules.arm(
      browserPageId,
      rules.filter((rule) => armedIds.has(rule.id))
    )
  }
  return true
}

export function armBrowserNetworkRules(
  browserPageId: string,
  ruleIds: string[]
): BrowserNetworkArmResult {
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
  armedRules.arm(browserPageId, resolved)
  return { armed: true }
}

export function disarmBrowserNetworkRules(browserPageId: string): boolean {
  armedRules.disarm(browserPageId)
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
