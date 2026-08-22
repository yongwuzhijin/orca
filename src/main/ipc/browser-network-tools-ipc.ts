import { ipcMain } from 'electron'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import { onBrowserGuestTeardown } from '../browser/browser-guest-teardown-listeners'
import {
  armBrowserNetworkRules,
  armedBrowserNetworkRuleIds,
  disarmBrowserNetworkRules,
  handleBrowserNetworkGuestDestroyed,
  listBrowserNetworkRules,
  readBrowserNetworkLog,
  saveBrowserNetworkRules,
  type BrowserNetworkArmResult
} from '../browser/browser-network-tools-controller'
import {
  cancelBrowserApiTestRequest,
  runBrowserApiTestRequest
} from '../browser/browser-api-test-controller'
import {
  sanitizeBrowserNetworkRule,
  type BrowserNetworkRule
} from '../../shared/browser-network-rule'
import type { BrowserNetworkLogRead } from '../../shared/browser-network-log-types'
import type {
  BrowserApiTestHeader,
  BrowserApiTestRequest,
  BrowserApiTestResponse
} from '../../shared/browser-api-test-types'

const EMPTY_LOG: BrowserNetworkLogRead = { entries: [], truncated: false }

const UNTRUSTED_API_RESULT: BrowserApiTestResponse = {
  status: 'error',
  reason: 'no_guest',
  message: 'Renderer is not allowed to send API test requests.',
  durationMs: 0
}

// Why 'network' and not 'invalid_url': the renderer localizes from `reason`, and only a stale
// bundle reaches here, so naming one field would lie whenever a different one is the bad one.
const MALFORMED_API_RESULT: BrowserApiTestResponse = {
  status: 'error',
  reason: 'network',
  message: 'Malformed request payload.',
  durationMs: 0
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const items = value.filter((item): item is string => typeof item === 'string')
  return items.length === value.length ? items : null
}

function headerList(value: unknown): BrowserApiTestHeader[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const headers: BrowserApiTestHeader[] = []
  for (const item of value) {
    const entry = item as { name?: unknown; value?: unknown; enabled?: unknown } | null
    if (typeof entry?.name !== 'string' || typeof entry.value !== 'string') {
      return null
    }
    headers.push({ name: entry.name, value: entry.value, enabled: entry.enabled !== false })
  }
  return headers
}

function apiTestRequest(value: unknown): BrowserApiTestRequest | null {
  const raw = value as Record<string, unknown> | null | undefined
  if (
    typeof raw?.browserPageId !== 'string' ||
    raw.browserPageId.length === 0 ||
    typeof raw.requestId !== 'string' ||
    raw.requestId.length === 0 ||
    typeof raw.method !== 'string' ||
    typeof raw.url !== 'string' ||
    typeof raw.body !== 'string'
  ) {
    return null
  }
  const headers = headerList(raw.headers)
  if (!headers) {
    return null
  }
  return {
    browserPageId: raw.browserPageId,
    requestId: raw.requestId,
    method: raw.method,
    url: raw.url,
    headers,
    body: raw.body
  }
}

export function registerBrowserNetworkToolsHandlers(): void {
  ipcMain.removeHandler('browser:network:listRules')
  ipcMain.removeHandler('browser:network:saveRules')
  ipcMain.removeHandler('browser:network:armRules')
  ipcMain.removeHandler('browser:network:disarmRules')
  ipcMain.removeHandler('browser:network:armedRuleIds')
  ipcMain.removeHandler('browser:network:readLog')
  ipcMain.removeHandler('browser:network:sendRequest')
  ipcMain.removeHandler('browser:network:cancelRequest')

  // Why: the guest-lifecycle owner announces teardown instead of importing us, which would cycle.
  onBrowserGuestTeardown(handleBrowserNetworkGuestDestroyed)

  ipcMain.handle('browser:network:listRules', (event): BrowserNetworkRule[] => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return []
    }
    return listBrowserNetworkRules()
  })

  ipcMain.handle('browser:network:saveRules', (event, args: { rules?: unknown }): boolean => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return false
    }
    if (!Array.isArray(args?.rules)) {
      return false
    }
    // Why: the renderer is trusted but not authoritative — a stale bundle can still send a
    // half-built rule, and one bad rule must not poison the file every request then reads.
    const rules = args.rules
      .map(sanitizeBrowserNetworkRule)
      .filter((rule): rule is BrowserNetworkRule => rule !== null)
    if (rules.length !== args.rules.length) {
      return false
    }
    return saveBrowserNetworkRules(rules)
  })

  ipcMain.handle(
    'browser:network:armRules',
    (
      event,
      args: { browserPageId?: unknown; ruleIds?: unknown }
    ): BrowserNetworkArmResult & { armedRuleIds: string[] } => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return { armed: false, reason: 'no_guest', armedRuleIds: [] }
      }
      const browserPageId = typeof args?.browserPageId === 'string' ? args.browserPageId : ''
      const ruleIds = stringList(args?.ruleIds)
      if (!browserPageId || !ruleIds) {
        return { armed: false, reason: 'unknown_rules', armedRuleIds: [] }
      }
      const result = armBrowserNetworkRules(browserPageId, ruleIds)
      return { ...result, armedRuleIds: armedBrowserNetworkRuleIds(browserPageId) }
    }
  )

  ipcMain.handle(
    'browser:network:disarmRules',
    (event, args: { browserPageId?: unknown }): boolean => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return false
      }
      if (typeof args?.browserPageId !== 'string' || args.browserPageId.length === 0) {
        return false
      }
      return disarmBrowserNetworkRules(args.browserPageId)
    }
  )

  ipcMain.handle(
    'browser:network:armedRuleIds',
    (event, args: { browserPageId?: unknown }): { armedRuleIds: string[] } => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return { armedRuleIds: [] }
      }
      if (typeof args?.browserPageId !== 'string' || args.browserPageId.length === 0) {
        return { armedRuleIds: [] }
      }
      return { armedRuleIds: armedBrowserNetworkRuleIds(args.browserPageId) }
    }
  )

  ipcMain.handle(
    'browser:network:readLog',
    (event, args: { browserPageId?: unknown; limit?: unknown }): BrowserNetworkLogRead => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return EMPTY_LOG
      }
      if (typeof args?.browserPageId !== 'string' || args.browserPageId.length === 0) {
        return EMPTY_LOG
      }
      const limit =
        typeof args.limit === 'number' && Number.isInteger(args.limit) && args.limit > 0
          ? args.limit
          : 100
      return readBrowserNetworkLog(args.browserPageId, limit)
    }
  )

  ipcMain.handle(
    'browser:network:sendRequest',
    async (event, args: { request?: unknown }): Promise<BrowserApiTestResponse> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return UNTRUSTED_API_RESULT
      }
      const request = apiTestRequest(args?.request)
      if (!request) {
        return MALFORMED_API_RESULT
      }
      return runBrowserApiTestRequest(request)
    }
  )

  ipcMain.handle(
    'browser:network:cancelRequest',
    (event, args: { requestId?: unknown }): boolean => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return false
      }
      if (typeof args?.requestId !== 'string' || args.requestId.length === 0) {
        return false
      }
      return cancelBrowserApiTestRequest(args.requestId)
    }
  )
}
