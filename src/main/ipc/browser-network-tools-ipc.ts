import { ipcMain } from 'electron'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import {
  armBrowserNetworkRules,
  armedBrowserNetworkRuleIds,
  disarmBrowserNetworkRules,
  listBrowserNetworkRules,
  readBrowserNetworkLog,
  saveBrowserNetworkRules,
  type BrowserNetworkArmResult
} from '../browser/browser-network-tools-controller'
import {
  sanitizeBrowserNetworkRule,
  type BrowserNetworkRule
} from '../../shared/browser-network-rule'
import type { BrowserNetworkLogRead } from '../../shared/browser-network-log-types'

const EMPTY_LOG: BrowserNetworkLogRead = { entries: [], truncated: false }

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const items = value.filter((item): item is string => typeof item === 'string')
  return items.length === value.length ? items : null
}

export function registerBrowserNetworkToolsHandlers(): void {
  ipcMain.removeHandler('browser:network:listRules')
  ipcMain.removeHandler('browser:network:saveRules')
  ipcMain.removeHandler('browser:network:armRules')
  ipcMain.removeHandler('browser:network:disarmRules')
  ipcMain.removeHandler('browser:network:armedRuleIds')
  ipcMain.removeHandler('browser:network:readLog')

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
}
