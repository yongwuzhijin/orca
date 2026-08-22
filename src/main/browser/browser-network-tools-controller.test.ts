import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from 'electron'

const persisted: { rules: unknown[]; ok: boolean } = { rules: [], ok: true }

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/orca-test' },
  webContents: { fromId: (id: number) => (id > 0 ? ({ id } as never) : null) }
}))
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

const overrides: {
  started: unknown[][]
  updated: unknown[][]
  closed: number
  fail: string | null
} = { started: [], updated: [], closed: 0, fail: null }
vi.mock('./browser-network-response-override', async () => {
  const actual = await import('./browser-network-response-override')
  return {
    ...actual,
    startBrowserNetworkOverrides: async (webContents: unknown, rules: unknown) => {
      if (overrides.fail) {
        throw new Error(overrides.fail)
      }
      overrides.started.push([webContents, rules])
      return {
        update: async (next: unknown) => {
          overrides.updated.push([next])
        },
        close: () => {
          overrides.closed += 1
        }
      }
    }
  }
})

const pageIdByWebContentsId = new Map<number, string>()
vi.mock('./browser-manager', () => ({
  browserManager: {
    resolveBrowserPageIdForGuestWebContentsId: (id: number) =>
      pageIdByWebContentsId.get(id) ?? null,
    hasRegisteredGuestForBrowserPage: (pageId: string) =>
      [...pageIdByWebContentsId.values()].includes(pageId),
    getGuestWebContentsId: (pageId: string) =>
      [...pageIdByWebContentsId.entries()].find(([, id]) => id === pageId)?.[0] ?? null
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
  overrides.started = []
  overrides.updated = []
  overrides.closed = 0
  overrides.fail = null
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

  it('refuses to arm a page with no registered guest', async () => {
    saveBrowserNetworkRules([RULE])
    const result = await armBrowserNetworkRules('page-missing', ['rule-1'])
    expect(result).toEqual({ armed: false, reason: 'no_guest' })
  })

  it('refuses to arm when any rule id does not exist', async () => {
    saveBrowserNetworkRules([RULE])
    const result = await armBrowserNetworkRules('page-a', ['rule-1', 'nope'])
    expect(result).toEqual({ armed: false, reason: 'unknown_rules' })
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('arms a saved rule for a page with a guest', async () => {
    saveBrowserNetworkRules([RULE])
    expect(await armBrowserNetworkRules('page-a', ['rule-1'])).toEqual({ armed: true })
  })

  it('reports an empty log for a page that has seen no requests', () => {
    expect(readBrowserNetworkLog('page-a', 50)).toEqual({ entries: [], truncated: false })
  })

  it('disarms the rules armed on a page', async () => {
    saveBrowserNetworkRules([RULE])
    await armBrowserNetworkRules('page-a', ['rule-1'])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual(['rule-1'])
    expect(disarmBrowserNetworkRules('page-a')).toBe(true)
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('keeps a save from arming rules the page never armed', async () => {
    saveBrowserNetworkRules([RULE, OTHER_RULE])
    await armBrowserNetworkRules('page-a', ['rule-1'])
    saveBrowserNetworkRules([RULE, { ...OTHER_RULE, label: 'canary routing v2' }])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual(['rule-1'])
  })

  it('drops armed rules when the guest is destroyed', async () => {
    saveBrowserNetworkRules([RULE])
    await armBrowserNetworkRules('page-a', ['rule-1'])
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual(['rule-1'])
    handleBrowserNetworkGuestDestroyed('page-a')
    expect(armedBrowserNetworkRuleIds('page-a')).toEqual([])
  })

  it('rewrites and logs a request through the installed stages', async () => {
    const { sess, listeners } = createFakeSession()
    installBrowserNetworkToolsStages(sess)
    saveBrowserNetworkRules([RULE])
    await armBrowserNetworkRules('page-a', ['rule-1'])

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
  it('keeps rewriting when a client hints stage registers on the same session', async () => {
    const { sess, listeners } = createFakeSession()
    installBrowserNetworkToolsStages(sess)
    setBrowserRequestHeadersStage(sess, 'client-hints', (_details, headers) => {
      headers['Sec-Ch-Ua'] = 'Chromium'
    })
    saveBrowserNetworkRules([RULE])
    await armBrowserNetworkRules('page-a', ['rule-1'])

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

describe('response override arming', () => {
  const overrideRule = {
    id: 'ov-1',
    label: 'Override',
    enabled: true,
    match: { urlPattern: 'https://api.test/*' },
    headers: [],
    responseOverride: { statusCode: 418, headers: [], body: 'teapot' }
  }

  // The session registry is a module singleton, so a session left live leaks into the next test and
  // sends it down the update path. Drain the queued close before the next reset of the counters.
  afterEach(async () => {
    handleBrowserNetworkGuestDestroyed('page-1')
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('starts a CDP session for a rule with an override', async () => {
    pageIdByWebContentsId.set(7, 'page-1')
    saveBrowserNetworkRules([overrideRule])
    expect(await armBrowserNetworkRules('page-1', ['ov-1'])).toEqual({ armed: true })
    expect(overrides.started).toHaveLength(1)
  })

  it('refuses to arm when the CDP session cannot start', async () => {
    pageIdByWebContentsId.set(7, 'page-1')
    saveBrowserNetworkRules([overrideRule])
    overrides.fail = 'DevTools is open'
    expect(await armBrowserNetworkRules('page-1', ['ov-1'])).toEqual({
      armed: false,
      reason: 'cdp_error'
    })
    expect(armedBrowserNetworkRuleIds('page-1')).toEqual([])
  })

  it('closes the session on disarm', async () => {
    pageIdByWebContentsId.set(7, 'page-1')
    saveBrowserNetworkRules([overrideRule])
    await armBrowserNetworkRules('page-1', ['ov-1'])
    disarmBrowserNetworkRules('page-1')
    // close() is queued behind the arm's sync, so it lands a microtask later.
    await vi.waitFor(() => expect(overrides.closed).toBe(1))
  })

  it('closes the session when the guest is destroyed', async () => {
    pageIdByWebContentsId.set(7, 'page-1')
    saveBrowserNetworkRules([overrideRule])
    await armBrowserNetworkRules('page-1', ['ov-1'])
    handleBrowserNetworkGuestDestroyed('page-1')
    await vi.waitFor(() => expect(overrides.closed).toBe(1))
  })

  it('pushes an edit to an armed override into the live session', async () => {
    pageIdByWebContentsId.set(7, 'page-1')
    saveBrowserNetworkRules([overrideRule])
    await armBrowserNetworkRules('page-1', ['ov-1'])
    saveBrowserNetworkRules([
      { ...overrideRule, responseOverride: { statusCode: 500, headers: [], body: 'boom' } }
    ])
    await vi.waitFor(() => expect(overrides.updated).toHaveLength(1))
  })

  it('does not start a session for a header-only rule', async () => {
    pageIdByWebContentsId.set(7, 'page-1')
    saveBrowserNetworkRules([{ ...overrideRule, responseOverride: undefined }])
    expect(await armBrowserNetworkRules('page-1', ['ov-1'])).toEqual({ armed: true })
    expect(overrides.started).toHaveLength(0)
  })
})
