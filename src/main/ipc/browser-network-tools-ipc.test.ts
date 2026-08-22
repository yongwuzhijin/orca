import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  handleMock,
  removeHandlerMock,
  listRulesMock,
  saveRulesMock,
  armRulesMock,
  disarmRulesMock,
  armedRuleIdsMock,
  readLogMock,
  handleGuestDestroyedMock,
  sendRequestMock,
  cancelRequestMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  listRulesMock: vi.fn(),
  saveRulesMock: vi.fn(),
  armRulesMock: vi.fn(),
  disarmRulesMock: vi.fn(),
  armedRuleIdsMock: vi.fn(),
  readLogMock: vi.fn(),
  handleGuestDestroyedMock: vi.fn(),
  sendRequestMock: vi.fn(),
  cancelRequestMock: vi.fn()
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
  readBrowserNetworkLog: readLogMock,
  handleBrowserNetworkGuestDestroyed: handleGuestDestroyedMock
}))

vi.mock('../browser/browser-api-test-controller', () => ({
  runBrowserApiTestRequest: sendRequestMock,
  cancelBrowserApiTestRequest: cancelRequestMock
}))

import { notifyBrowserGuestTeardown } from '../browser/browser-guest-teardown-listeners'
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

const validApiRequest = {
  browserPageId: 'page-1',
  requestId: 'req-1',
  method: 'POST',
  url: 'https://example.com/api',
  headers: [{ name: 'X-Test', value: '1', enabled: true }],
  body: '{"a":1}'
}

const okApiResponse = {
  status: 'ok',
  statusCode: 200,
  statusMessage: 'OK',
  headers: { 'content-type': ['application/json'] },
  body: '{}',
  bodyBytes: 2,
  truncated: false,
  textual: true,
  durationMs: 12
}

const UNTRUSTED_API_RESULT = {
  status: 'error',
  reason: 'no_guest',
  message: 'Renderer is not allowed to send API test requests.',
  durationMs: 0
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
    readLogMock,
    sendRequestMock,
    cancelRequestMock
  ]
}

describe('browser network tools IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
    removeHandlerMock.mockReset()
    for (const mock of controllerMocks()) {
      mock.mockReset()
    }
    handleGuestDestroyedMock.mockReset()
    listRulesMock.mockReturnValue([storedRule])
    saveRulesMock.mockReturnValue(true)
    armRulesMock.mockResolvedValue({ armed: true })
    disarmRulesMock.mockReturnValue(true)
    armedRuleIdsMock.mockReturnValue(['rule-a'])
    readLogMock.mockReturnValue({ entries: [logEntry], truncated: true })
    sendRequestMock.mockResolvedValue(okApiResponse)
    cancelRequestMock.mockReturnValue(true)
    setTrustedBrowserRendererWebContentsId(TRUSTED_ID)
    registerBrowserHandlers()
  })

  it('registers all eight network tools channels', () => {
    const channels = [
      'browser:network:listRules',
      'browser:network:saveRules',
      'browser:network:armRules',
      'browser:network:disarmRules',
      'browser:network:armedRuleIds',
      'browser:network:readLog',
      'browser:network:sendRequest',
      'browser:network:cancelRequest'
    ]
    for (const channel of channels) {
      expect(removeHandlerMock).toHaveBeenCalledWith(channel)
      expect(handlerFor(channel)).toBeTypeOf('function')
    }
  })

  // Why: the manager only announces teardown now, so registration here is what still drops state.
  // The single call also proves re-running the registrar cannot double-subscribe the handler.
  it('subscribes the controller teardown handler to the guest teardown registry', () => {
    notifyBrowserGuestTeardown('page-1')

    expect(handleGuestDestroyedMock).toHaveBeenCalledTimes(1)
    expect(handleGuestDestroyedMock).toHaveBeenCalledWith('page-1')
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
    },
    {
      channel: 'browser:network:sendRequest',
      args: { request: validApiRequest },
      expected: UNTRUSTED_API_RESULT
    },
    { channel: 'browser:network:cancelRequest', args: { requestId: 'req-1' }, expected: false }
  ])('$channel', ({ channel, args, expected }) => {
    it('returns the safe value and skips the controller for an untrusted sender', async () => {
      expect(await handlerFor(channel)({ sender: untrustedSender }, args)).toEqual(expected)
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

  it('reports a rejected persist as a failed save', () => {
    saveRulesMock.mockReturnValue(false)

    expect(
      handlerFor('browser:network:saveRules')({ sender: trustedSender }, { rules: [validRule] })
    ).toBe(false)
    expect(saveRulesMock).toHaveBeenCalledWith([expect.objectContaining({ id: 'rule-a' })])
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

  it('rejects an arm request carrying a non-string rule id', async () => {
    const result = await handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: 'page-1', ruleIds: ['a', 7] }
    )

    expect(result).toEqual({ armed: false, reason: 'unknown_rules', armedRuleIds: [] })
    expect(armRulesMock).not.toHaveBeenCalled()
  })

  it('rejects an arm request whose rule ids are absent or not an array', async () => {
    const handler = handlerFor('browser:network:armRules')
    const rejected = { armed: false, reason: 'unknown_rules', armedRuleIds: [] }

    expect(await handler({ sender: trustedSender }, { browserPageId: 'page-1' })).toEqual(rejected)
    expect(
      await handler({ sender: trustedSender }, { browserPageId: 'page-1', ruleIds: 'rule-a' })
    ).toEqual(rejected)
    expect(armRulesMock).not.toHaveBeenCalled()
  })

  it('rejects an arm request with a blank page id', async () => {
    const result = await handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: '', ruleIds: ['rule-a'] }
    )

    expect(result).toEqual({ armed: false, reason: 'unknown_rules', armedRuleIds: [] })
    expect(armRulesMock).not.toHaveBeenCalled()
  })

  it('arms rules and reports the resulting armed set', async () => {
    const result = await handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: 'page-1', ruleIds: ['rule-a'] }
    )

    expect(result).toEqual({ armed: true, armedRuleIds: ['rule-a'] })
    expect(armRulesMock).toHaveBeenCalledWith('page-1', ['rule-a'])
    expect(armedRuleIdsMock).toHaveBeenCalledWith('page-1')
  })

  // Why: cdp_error is the reason the renderer needs to tell "no tab" apart from "interception
  // refused", so the boundary must carry it through instead of flattening it to a bare false.
  it('carries a cdp_error arm refusal through to the renderer', async () => {
    armRulesMock.mockResolvedValue({ armed: false, reason: 'cdp_error' })
    armedRuleIdsMock.mockReturnValue([])

    const result = await handlerFor('browser:network:armRules')(
      { sender: trustedSender },
      { browserPageId: 'page-1', ruleIds: ['rule-a'] }
    )

    expect(result).toEqual({ armed: false, reason: 'cdp_error', armedRuleIds: [] })
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

  it('reports a rejected disarm as a failure', () => {
    disarmRulesMock.mockReturnValue(false)
    const handler = handlerFor('browser:network:disarmRules')

    expect(handler({ sender: trustedSender }, { browserPageId: 'page-1' })).toBe(false)
    expect(disarmRulesMock).toHaveBeenCalledWith('page-1')
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

  it('falls back to the default log limit for a limit that is not a whole number', () => {
    const handler = handlerFor('browser:network:readLog')

    handler({ sender: trustedSender }, { browserPageId: 'page-1', limit: Infinity })
    expect(readLogMock).toHaveBeenLastCalledWith('page-1', 100)

    handler({ sender: trustedSender }, { browserPageId: 'page-1', limit: 2.5 })
    expect(readLogMock).toHaveBeenLastCalledWith('page-1', 100)
  })

  describe('api test channels', () => {
    it('forwards a well-formed request to the controller and returns its response', async () => {
      const result = await handlerFor('browser:network:sendRequest')(
        { sender: trustedSender },
        { request: validApiRequest }
      )

      expect(result).toEqual(okApiResponse)
      expect(sendRequestMock).toHaveBeenCalledWith(validApiRequest)
    })

    it('defaults a header with no enabled flag to enabled', async () => {
      await handlerFor('browser:network:sendRequest')(
        { sender: trustedSender },
        { request: { ...validApiRequest, headers: [{ name: 'X-Test', value: '1' }] } }
      )

      expect(sendRequestMock).toHaveBeenCalledWith({
        ...validApiRequest,
        headers: [{ name: 'X-Test', value: '1', enabled: true }]
      })
    })

    it('preserves an explicitly disabled header', async () => {
      await handlerFor('browser:network:sendRequest')(
        { sender: trustedSender },
        {
          request: {
            ...validApiRequest,
            headers: [{ name: 'X-Test', value: '1', enabled: false }]
          }
        }
      )

      expect(sendRequestMock).toHaveBeenCalledWith({
        ...validApiRequest,
        headers: [{ name: 'X-Test', value: '1', enabled: false }]
      })
    })

    // Why: a stale renderer bundle can send a half-built payload, and the controller's own
    // short-circuits assume every field is present with the right type.
    it.each([
      { label: 'missing browserPageId', patch: { browserPageId: '' } },
      { label: 'missing requestId', patch: { requestId: '' } },
      { label: 'non-string method', patch: { method: 7 } },
      { label: 'non-string url', patch: { url: null } },
      { label: 'non-string body', patch: { body: undefined } },
      { label: 'non-array headers', patch: { headers: 'X-Test: 1' } },
      { label: 'header with a non-string value', patch: { headers: [{ name: 'X', value: 3 }] } },
      // A string is iterable, so the case above passes even with the Array.isArray guard gone. A
      // Set survives structured clone, which makes it the payload that actually pins the guard.
      {
        label: 'iterable-but-not-array headers',
        patch: { headers: new Set([{ name: 'X', value: '1' }]) }
      },
      { label: 'non-iterable headers', patch: { headers: 7 } }
    ])('rejects a malformed request: $label', async ({ patch }) => {
      const result = await handlerFor('browser:network:sendRequest')(
        { sender: trustedSender },
        { request: { ...validApiRequest, ...patch } }
      )

      expect(result).toEqual({
        status: 'error',
        reason: 'network',
        message: 'Malformed request payload.',
        durationMs: 0
      })
      expect(sendRequestMock).not.toHaveBeenCalled()
    })

    it('rejects a request payload that is not an object at all', async () => {
      const result = await handlerFor('browser:network:sendRequest')(
        { sender: trustedSender },
        undefined
      )

      expect((result as { status: string }).status).toBe('error')
      expect(sendRequestMock).not.toHaveBeenCalled()
    })

    // Why: the trust guard must run before payload validation, so an untrusted sender learns
    // nothing about which field it got wrong.
    it('rejects an untrusted sender before inspecting the payload', async () => {
      const result = await handlerFor('browser:network:sendRequest')(
        { sender: untrustedSender },
        { request: { ...validApiRequest, url: null } }
      )

      expect(result).toEqual(UNTRUSTED_API_RESULT)
      expect(sendRequestMock).not.toHaveBeenCalled()
    })

    it('forwards a cancel to the controller and returns its verdict', () => {
      cancelRequestMock.mockReturnValue(false)

      expect(
        handlerFor('browser:network:cancelRequest')(
          { sender: trustedSender },
          { requestId: 'req-1' }
        )
      ).toBe(false)
      expect(cancelRequestMock).toHaveBeenCalledWith('req-1')
    })

    it.each([
      { label: 'blank', args: { requestId: '' } },
      { label: 'non-string', args: { requestId: 12 } },
      { label: 'absent', args: {} }
    ])('refuses a cancel with a $label requestId', ({ args }) => {
      expect(handlerFor('browser:network:cancelRequest')({ sender: trustedSender }, args)).toBe(
        false
      )
      expect(cancelRequestMock).not.toHaveBeenCalled()
    })
  })
})
