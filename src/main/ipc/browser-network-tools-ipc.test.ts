import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handleMock,
  removeHandlerMock,
  listRulesMock,
  saveRulesMock,
  armRulesMock,
  disarmRulesMock,
  armedRuleIdsMock,
  readLogMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  listRulesMock: vi.fn(),
  saveRulesMock: vi.fn(),
  armRulesMock: vi.fn(),
  disarmRulesMock: vi.fn(),
  armedRuleIdsMock: vi.fn(),
  readLogMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock },
  webContents: { fromId: vi.fn() }
}))

vi.mock('../browser/browser-manager', () => ({
  browserCertificateTrustController: { proceed: vi.fn() },
  browserManager: {
    getWebContentsIdByTabId: vi.fn(() => new Map())
  }
}))

vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {
    createProfile: vi.fn(),
    getProfile: vi.fn()
  }
}))

vi.mock('../browser/browser-cookie-import', () => ({
  detectInstalledBrowsers: vi.fn(() => []),
  importCookiesFromBrowser: vi.fn(),
  importCookiesFromFile: vi.fn(),
  pickCookieFile: vi.fn(),
  selectBrowserProfile: vi.fn()
}))

vi.mock('../browser/browser-network-tools-controller', () => ({
  listBrowserNetworkRules: listRulesMock,
  saveBrowserNetworkRules: saveRulesMock,
  armBrowserNetworkRules: armRulesMock,
  disarmBrowserNetworkRules: disarmRulesMock,
  armedBrowserNetworkRuleIds: armedRuleIdsMock,
  readBrowserNetworkLog: readLogMock
}))

import { registerBrowserHandlers } from './browser'
import { setTrustedBrowserRendererWebContentsId } from './browser-renderer-trust'

type Handler = (event: { sender: Electron.WebContents }, args?: unknown) => unknown

const TRUSTED_ID = 7

const trustedSender = {
  id: TRUSTED_ID,
  isDestroyed: () => false,
  getType: () => 'window',
  getURL: () => 'file:///index.html'
} as Electron.WebContents

const untrustedSender = {
  id: TRUSTED_ID,
  isDestroyed: () => false,
  getType: () => 'webview',
  getURL: () => 'file:///index.html'
} as unknown as Electron.WebContents

const validRule = {
  id: 'rule-a',
  label: 'Rule A',
  match: { urlPattern: 'https://example.com/*' },
  headers: []
}

const storedRule = { ...validRule, enabled: true, match: { urlPattern: 'https://example.com/*' } }

const logEntry = {
  id: 1,
  url: 'https://example.com/api',
  method: 'GET',
  resourceType: 'xhr',
  startedAt: 1000
}

function handlerFor(channel: string): Handler {
  const entry = handleMock.mock.calls.find(([name]) => name === channel)
  if (!entry) {
    throw new Error(`no handler registered for ${channel}`)
  }
  return entry[1] as Handler
}

function controllerMocks(): ReturnType<typeof vi.fn>[] {
  return [
    listRulesMock,
    saveRulesMock,
    armRulesMock,
    disarmRulesMock,
    armedRuleIdsMock,
    readLogMock
  ]
}

describe('browser network tools IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
    removeHandlerMock.mockReset()
    for (const mock of controllerMocks()) {
      mock.mockReset()
    }
    listRulesMock.mockReturnValue([storedRule])
    saveRulesMock.mockReturnValue(true)
    armRulesMock.mockReturnValue({ armed: true })
    disarmRulesMock.mockReturnValue(true)
    armedRuleIdsMock.mockReturnValue(['rule-a'])
    readLogMock.mockReturnValue({ entries: [logEntry], truncated: true })
    setTrustedBrowserRendererWebContentsId(TRUSTED_ID)
    registerBrowserHandlers()
  })

  it('registers all six network tools channels', () => {
    const channels = [
      'browser:network:listRules',
      'browser:network:saveRules',
      'browser:network:armRules',
      'browser:network:disarmRules',
      'browser:network:armedRuleIds',
      'browser:network:readLog'
    ]
    for (const channel of channels) {
      expect(removeHandlerMock).toHaveBeenCalledWith(channel)
      expect(handlerFor(channel)).toBeTypeOf('function')
    }
  })

  describe.each([
    { channel: 'browser:network:listRules', args: undefined, expected: [] },
    { channel: 'browser:network:saveRules', args: { rules: [validRule] }, expected: false },
    {
      channel: 'browser:network:armRules',
      args: { browserPageId: 'page-1', ruleIds: ['rule-a'] },
      expected: { armed: false, reason: 'no_guest', armedRuleIds: [] }
    },
    { channel: 'browser:network:disarmRules', args: { browserPageId: 'page-1' }, expected: false },
    {
      channel: 'browser:network:armedRuleIds',
      args: { browserPageId: 'page-1' },
      expected: { armedRuleIds: [] }
    },
    {
      channel: 'browser:network:readLog',
      args: { browserPageId: 'page-1' },
      expected: { entries: [], truncated: false }
    }
  ])('$channel', ({ channel, args, expected }) => {
    it('returns the safe value and never reaches the controller for an untrusted sender', () => {
      expect(handlerFor(channel)({ sender: untrustedSender }, args)).toEqual(expected)
      for (const mock of controllerMocks()) {
        expect(mock).not.toHaveBeenCalled()
      }
    })
  })

  it('serves the stored rules to a trusted renderer', () => {
    expect(handlerFor('browser:network:listRules')({ sender: trustedSender })).toEqual([storedRule])
    expect(listRulesMock).toHaveBeenCalledTimes(1)
  })

  it('rejects the whole save batch when any rule fails sanitization', () => {
    const result = handlerFor('browser:network:saveRules')(
      { sender: trustedSender },
      { rules: [validRule, { match: { urlPattern: 'https://example.com/*' } }] }
    )

    expect(result).toBe(false)
    expect(saveRulesMock).not.toHaveBeenCalled()
  })

  it('persists a fully sanitized save batch', () => {
    expect(
      handlerFor('browser:network:saveRules')({ sender: trustedSender }, { rules: [validRule] })
    ).toBe(true)
    expect(saveRulesMock).toHaveBeenCalledWith([expect.objectContaining({ id: 'rule-a' })])
  })

  it('rejects a save payload whose rules field is not an array', () => {
    expect(handlerFor('browser:network:saveRules')({ sender: trustedSender }, {})).toBe(false)
    expect(saveRulesMock).not.toHaveBeenCalled()
  })

  it('rejects an arm request carrying a non-string rule id', () => {
    const result = handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: 'page-1', ruleIds: ['a', 7] }
    )

    expect(result).toEqual({ armed: false, reason: 'unknown_rules', armedRuleIds: [] })
    expect(armRulesMock).not.toHaveBeenCalled()
  })

  it('rejects an arm request with a blank page id', () => {
    const result = handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: '', ruleIds: ['rule-a'] }
    )

    expect(result).toEqual({ armed: false, reason: 'unknown_rules', armedRuleIds: [] })
    expect(armRulesMock).not.toHaveBeenCalled()
  })

  it('arms rules and reports the resulting armed set', () => {
    const result = handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: 'page-1', ruleIds: ['rule-a'] }
    )

    expect(result).toEqual({ armed: true, armedRuleIds: ['rule-a'] })
    expect(armRulesMock).toHaveBeenCalledWith('page-1', ['rule-a'])
  })

  it('reads the armed rule ids without ever arming', () => {
    const handler = handlerFor('browser:network:armedRuleIds')

    expect(handler({ sender: trustedSender }, { browserPageId: 'page-1' })).toEqual({
      armedRuleIds: ['rule-a']
    })
    expect(handler({ sender: trustedSender }, { browserPageId: 'page-1' })).toEqual({
      armedRuleIds: ['rule-a']
    })

    expect(armRulesMock).not.toHaveBeenCalled()
    expect(disarmRulesMock).not.toHaveBeenCalled()
    expect(armedRuleIdsMock).toHaveBeenCalledTimes(2)
    expect(armedRuleIdsMock).toHaveBeenCalledWith('page-1')
  })

  it('rejects an armed-rule-ids read with a blank page id', () => {
    expect(
      handlerFor('browser:network:armedRuleIds')({ sender: trustedSender }, { browserPageId: '' })
    ).toEqual({ armedRuleIds: [] })
    expect(armedRuleIdsMock).not.toHaveBeenCalled()
  })

  it('disarms a page for a trusted renderer and rejects a blank page id', () => {
    const handler = handlerFor('browser:network:disarmRules')

    expect(handler({ sender: trustedSender }, { browserPageId: 'page-1' })).toBe(true)
    expect(disarmRulesMock).toHaveBeenCalledWith('page-1')

    disarmRulesMock.mockClear()
    expect(handler({ sender: trustedSender }, { browserPageId: 42 })).toBe(false)
    expect(disarmRulesMock).not.toHaveBeenCalled()
  })

  it('returns an empty log and skips the controller when the page id is missing', () => {
    const handler = handlerFor('browser:network:readLog')

    expect(handler({ sender: trustedSender }, {})).toEqual({ entries: [], truncated: false })
    expect(handler({ sender: trustedSender }, { browserPageId: '' })).toEqual({
      entries: [],
      truncated: false
    })
    expect(readLogMock).not.toHaveBeenCalled()
  })

  it('defaults the log limit to 100 and forwards a supplied positive limit', () => {
    const handler = handlerFor('browser:network:readLog')

    expect(handler({ sender: trustedSender }, { browserPageId: 'page-1' })).toEqual({
      entries: [logEntry],
      truncated: true
    })
    expect(readLogMock).toHaveBeenLastCalledWith('page-1', 100)

    handler({ sender: trustedSender }, { browserPageId: 'page-1', limit: 25 })
    expect(readLogMock).toHaveBeenLastCalledWith('page-1', 25)

    handler({ sender: trustedSender }, { browserPageId: 'page-1', limit: 0 })
    expect(readLogMock).toHaveBeenLastCalledWith('page-1', 100)
  })
})
