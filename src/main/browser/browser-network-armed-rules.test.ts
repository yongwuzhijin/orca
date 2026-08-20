import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBrowserNetworkArmedRules } from './browser-network-armed-rules'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'

const PAGE_BY_WEB_CONTENTS = new Map<number, string>([
  [10, 'page-1'],
  [20, 'page-2']
])

// Why: spied because the ownerless-request guard is otherwise shadowed by the later guards —
// "never asked who owns it" is the only observable half.
const resolvePageId = vi.fn(
  (webContentsId: number): string | null => PAGE_BY_WEB_CONTENTS.get(webContentsId) ?? null
)

const AUTH_RULE: BrowserNetworkRule = {
  id: 'r1',
  label: 'staging auth',
  enabled: true,
  match: { urlPattern: 'https://api.example.com/*' },
  headers: [
    { target: 'request', op: 'set', name: 'Authorization', value: 'Bearer x' },
    { target: 'response', op: 'remove', name: 'Content-Security-Policy' }
  ]
}

const sendHeaders = (webContentsId: number | undefined, url = 'https://api.example.com/v1') =>
  ({
    id: 1,
    url,
    method: 'GET',
    resourceType: 'xhr',
    timestamp: 0,
    webContentsId,
    requestHeaders: {}
  }) as Electron.OnBeforeSendHeadersListenerDetails

const receiveHeaders = (webContentsId: number | undefined, url = 'https://api.example.com/v1') =>
  ({
    id: 1,
    url,
    method: 'GET',
    resourceType: 'xhr',
    timestamp: 0,
    statusCode: 200,
    webContentsId
  }) as Electron.OnHeadersReceivedListenerDetails

describe('browser network armed rules', () => {
  beforeEach(() => {
    resolvePageId.mockClear()
  })

  it('rewrites request headers for the armed page', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({ Authorization: 'Bearer x' })
  })

  it('leaves an unarmed sibling tab in the same partition untouched', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(20), headers)
    expect(headers).toEqual({})
  })

  it('leaves a request with no owning WebContents untouched', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(undefined), headers)
    expect(resolvePageId).not.toHaveBeenCalled()
    armed.requestHeadersStage(sendHeaders(999), headers)
    expect(resolvePageId.mock.calls).toEqual([[999]])
    expect(headers).toEqual({})
  })

  it('leaves a URL the rule does not match untouched', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10, 'https://other.example.com/v1'), headers)
    expect(headers).toEqual({})
  })

  it('ignores a disabled rule even on the armed page', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [{ ...AUTH_RULE, enabled: false }])
    const requestHeaders: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), requestHeaders)
    const responseHeaders: Record<string, string[]> = {
      'content-security-policy': ["default-src 'self'"]
    }
    armed.responseHeadersStage(receiveHeaders(10), responseHeaders)
    expect(requestHeaders).toEqual({})
    expect(responseHeaders).toEqual({ 'content-security-policy': ["default-src 'self'"] })
  })

  it('rewrites response headers for the armed page', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    const headers: Record<string, string[]> = {
      'content-security-policy': ["default-src 'self'"],
      Server: ['nginx']
    }
    armed.responseHeadersStage(receiveHeaders(10), headers)
    expect(headers).toEqual({ Server: ['nginx'] })
  })

  it('applies rules in table order so the last set wins', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [
      AUTH_RULE,
      {
        ...AUTH_RULE,
        id: 'r2',
        headers: [{ target: 'request', op: 'set', name: 'Authorization', value: 'Bearer later' }]
      }
    ])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({ Authorization: 'Bearer later' })
  })

  it('stops rewriting once the page is disarmed', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    armed.disarm('page-1')
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({})
    expect(armed.armedPageIds()).toEqual([])
  })

  it('reports which pages are armed and with what', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    armed.arm('page-2', [])
    expect(armed.armedPageIds().sort()).toEqual(['page-1', 'page-2'])
    expect(armed.rulesFor('page-1').map((rule) => rule.id)).toEqual(['r1'])
    expect(armed.rulesFor('page-9')).toEqual([])
  })
})
