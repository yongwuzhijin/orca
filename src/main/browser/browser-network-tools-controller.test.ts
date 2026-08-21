import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'

const persisted: { rules: unknown[]; ok: boolean } = { rules: [], ok: true }

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/orca-test' } }))
vi.mock('./browser-network-rule-store', () => ({
  BROWSER_NETWORK_RULES_FILE_NAME: 'browser-network-rules.json',
  loadBrowserNetworkRules: () => persisted.rules,
  persistBrowserNetworkRules: (_resolve: unknown, rules: unknown[]) => {
    if (persisted.ok) {
      persisted.rules = rules
    }
    return persisted.ok
  }
}))

const pageIdByWebContentsId = new Map<number, string>()
vi.mock('./browser-manager', () => ({
  browserManager: {
    resolveBrowserPageIdForGuestWebContentsId: (id: number) =>
      pageIdByWebContentsId.get(id) ?? null,
    hasRegisteredGuestForBrowserPage: (pageId: string) =>
      [...pageIdByWebContentsId.values()].includes(pageId)
  }
}))

import {
  armBrowserNetworkRules,
  armedBrowserNetworkRuleIds,
  disarmBrowserNetworkRules,
  handleBrowserNetworkGuestDestroyed,
  installBrowserNetworkToolsStages,
  listBrowserNetworkRules,
  readBrowserNetworkLog,
  saveBrowserNetworkRules
} from './browser-network-tools-controller'
import { setBrowserRequestHeadersStage } from './browser-session-request-pipeline'

const RULE = {
  id: 'rule-1',
  label: 'staging auth',
  enabled: true,
  match: { urlPattern: 'https://api.example.com/*' },
  headers: [{ target: 'request' as const, op: 'set' as const, name: 'X-Debug', value: '1' }]
}

const OTHER_RULE = {
  id: 'rule-2',
  label: 'canary routing',
  enabled: true,
  match: { urlPattern: 'https://canary.example.com/*' },
  headers: [{ target: 'request' as const, op: 'set' as const, name: 'X-Canary', value: 'on' }]
}

type CapturedListeners = {
  requestHeaders: (
    details: Electron.OnBeforeSendHeadersListenerDetails,
    callback: (response: Electron.BeforeSendResponse) => void
  ) => void
  responseHeaders: (
    details: Electron.OnHeadersReceivedListenerDetails,
    callback: (response: Electron.HeadersReceivedResponse) => void
  ) => void
  completed: (details: Electron.OnCompletedListenerDetails) => void
  errored: (details: Electron.OnErrorOccurredListenerDetails) => void
}

function createFakeSession(): { sess: Session; listeners: CapturedListeners } {
  const listeners = {} as CapturedListeners
  const sess = {
    webRequest: {
      onBeforeRequest: vi.fn(),
      onBeforeSendHeaders: vi.fn((listener: CapturedListeners['requestHeaders']) => {
        listeners.requestHeaders = listener
      }),
      onHeadersReceived: vi.fn((listener: CapturedListeners['responseHeaders']) => {
        listeners.responseHeaders = listener
      }),
      onCompleted: vi.fn((listener: CapturedListeners['completed']) => {
        listeners.completed = listener
      }),
      onErrorOccurred: vi.fn((listener: CapturedListeners['errored']) => {
        listeners.errored = listener
      })
    }
  } as unknown as Session
  return { sess, listeners }
}

beforeEach(() => {
  persisted.rules = []
  persisted.ok = true
  pageIdByWebContentsId.clear()
  pageIdByWebContentsId.set(7, 'page-a')
  handleBrowserNetworkGuestDestroyed('page-a')
})

describe('browser network tools controller', () => {
  it('persists rules and reads them back', () => {
    expect(saveBrowserNetworkRules([RULE])).toBe(true)
    expect(persisted.rules).toEqual([RULE])
    expect(listBrowserNetworkRules().map((rule) => rule.id)).toEqual(['rule-1'])
  })

  it('keeps the cached rules when the disk write fails', () => {
    saveBrowserNetworkRules([])
    persisted.ok = false
    expect(saveBrowserNetworkRules([RULE])).toBe(false)
    expect(listBrowserNetworkRules()).toEqual([])
  })

  it('refuses to arm a page with no registered guest', () => {
    saveBrowserNetworkRules([RULE])
    const result = armBrowserNetworkRules('page-missing', ['rule-1'])
    expect(result).toEqual({ armed: false, reason: 'no_guest' })
  })

  it('refuses to arm when any rule id does not exist', () => {
    saveBrowserNetworkRules([RULE])
    const result = armBrowserNetworkRules('page-a', ['rule-1', 'nope'])
    expect(result).toEqual({ armed: false, reason: 'unknown_rules' })
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('arms a saved rule for a page with a guest', () => {
    saveBrowserNetworkRules([RULE])
    expect(armBrowserNetworkRules('page-a', ['rule-1'])).toEqual({ armed: true })
  })

  it('reports an empty log for a page that has seen no requests', () => {
    expect(readBrowserNetworkLog('page-a', 50)).toEqual({ entries: [], truncated: false })
  })

  it('disarms the rules armed on a page', () => {
    saveBrowserNetworkRules([RULE])
    armBrowserNetworkRules('page-a', ['rule-1'])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual(['rule-1'])
    expect(disarmBrowserNetworkRules('page-a')).toBe(true)
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('keeps a save from arming rules the page never armed', () => {
    saveBrowserNetworkRules([RULE, OTHER_RULE])
    armBrowserNetworkRules('page-a', ['rule-1'])
    saveBrowserNetworkRules([RULE, { ...OTHER_RULE, label: 'canary routing v2' }])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual(['rule-1'])
  })

  it('drops armed rules when the guest is destroyed', () => {
    saveBrowserNetworkRules([RULE])
    armBrowserNetworkRules('page-a', ['rule-1'])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual(['rule-1'])
    handleBrowserNetworkGuestDestroyed('page-a')
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('rewrites and logs a request through the installed stages', () => {
    const { sess, listeners } = createFakeSession()
    installBrowserNetworkToolsStages(sess)
    saveBrowserNetworkRules([RULE])
    armBrowserNetworkRules('page-a', ['rule-1'])

    const fire = (): Electron.BeforeSendResponse => {
      const details = {
        id: 1,
        url: 'https://api.example.com/v1/items',
        method: 'GET',
        resourceType: 'xhr',
        webContentsId: 7,
        requestHeaders: { Accept: '*/*' }
      } as unknown as Electron.OnBeforeSendHeadersListenerDetails
      let response: Electron.BeforeSendResponse = {}
      listeners.requestHeaders(details, (value) => {
        response = value
      })
      return response
    }

    expect(fire().requestHeaders).toMatchObject({ 'X-Debug': '1' })
    const logged = readBrowserNetworkLog('page-a', 50)
    expect(logged.entries.map((entry) => entry.url)).toEqual(['https://api.example.com/v1/items'])
    expect(logged.entries[0].requestHeaders).toMatchObject({ 'X-Debug': '1' })

    listeners.completed({
      id: 1,
      statusCode: 200
    } as unknown as Electron.OnCompletedListenerDetails)
    expect(readBrowserNetworkLog('page-a', 50).entries[0].statusCode).toBe(200)

    saveBrowserNetworkRules([{ ...RULE, headers: [{ ...RULE.headers[0], value: '2' }] }])
    expect(fire().requestHeaders).toMatchObject({ 'X-Debug': '2' })

    handleBrowserNetworkGuestDestroyed('page-a')
    expect(readBrowserNetworkLog('page-a', 50).entries).toEqual([])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('logs the failure reason when a request errors out', () => {
    const { sess, listeners } = createFakeSession()
    installBrowserNetworkToolsStages(sess)

    listeners.requestHeaders(
      {
        id: 3,
        url: 'https://api.example.com/v1/broken',
        method: 'GET',
        resourceType: 'xhr',
        webContentsId: 7,
        requestHeaders: { Accept: '*/*' }
      } as unknown as Electron.OnBeforeSendHeadersListenerDetails,
      () => {}
    )
    listeners.errored({
      id: 3,
      error: 'net::ERR_CONNECTION_REFUSED'
    } as unknown as Electron.OnErrorOccurredListenerDetails)

    expect(readBrowserNetworkLog('page-a', 50).entries[0].error).toBe('net::ERR_CONNECTION_REFUSED')
  })

  // Why: client hints registers its stage second, so a shared key silently drops rule rewriting.
  it('keeps rewriting when a client hints stage registers on the same session', () => {
    const { sess, listeners } = createFakeSession()
    installBrowserNetworkToolsStages(sess)
    setBrowserRequestHeadersStage(sess, 'client-hints', (_details, headers) => {
      headers['Sec-Ch-Ua'] = 'Chromium'
    })
    saveBrowserNetworkRules([RULE])
    armBrowserNetworkRules('page-a', ['rule-1'])

    const details = {
      id: 2,
      url: 'https://api.example.com/v1/items',
      method: 'GET',
      resourceType: 'xhr',
      webContentsId: 7,
      requestHeaders: { Accept: '*/*' }
    } as unknown as Electron.OnBeforeSendHeadersListenerDetails
    let response: Electron.BeforeSendResponse = {}
    listeners.requestHeaders(details, (value) => {
      response = value
    })

    expect(response.requestHeaders).toMatchObject({ 'Sec-Ch-Ua': 'Chromium', 'X-Debug': '1' })
  })
})
