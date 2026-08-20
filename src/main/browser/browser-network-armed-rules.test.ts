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

const sendHeaders = (
  webContentsId: number | undefined,
  url = 'https://api.example.com/v1',
  method = 'GET',
  resourceType = 'xhr'
) =>
  ({
    id: 1,
    url,
    method,
    resourceType,
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

  it('applies mutations in order within one rule so a later remove undoes an earlier set', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [
      {
        ...AUTH_RULE,
        headers: [
          { target: 'request', op: 'set', name: 'X-A', value: 'first' },
          { target: 'request', op: 'remove', name: 'X-A' }
        ]
      }
    ])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({})
  })

  // Why: re-arming after the user edits a rule is the primary renderer flow for this feature.
  it('replaces the armed rule set rather than accumulating across arms', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    armed.arm('page-1', [
      {
        ...AUTH_RULE,
        id: 'r2',
        headers: [{ target: 'request', op: 'set', name: 'X-Env', value: 'staging' }]
      }
    ])
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({ 'X-Env': 'staging' })
    expect(armed.rulesFor('page-1').map((rule) => rule.id)).toEqual(['r2'])
  })

  it('snapshots the array handed to arm so the caller cannot arm a rule afterwards', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    const caller: BrowserNetworkRule[] = [AUTH_RULE]
    armed.arm('page-1', caller)
    caller.push({
      ...AUTH_RULE,
      id: 'sneaky',
      headers: [{ target: 'request', op: 'set', name: 'X-Sneaky', value: '1' }]
    })
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({ Authorization: 'Bearer x' })
    expect(armed.rulesFor('page-1').map((rule) => rule.id)).toEqual(['r1'])
  })

  it('hands rulesFor a copy so emptying it does not disarm the page', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [AUTH_RULE])
    armed.rulesFor('page-1').length = 0
    const headers: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10), headers)
    expect(headers).toEqual({ Authorization: 'Bearer x' })
    expect(armed.rulesFor('page-1')).toHaveLength(1)
  })

  it('matches on method and resourceType, not just the URL', () => {
    const armed = createBrowserNetworkArmedRules(resolvePageId)
    armed.arm('page-1', [
      {
        ...AUTH_RULE,
        match: {
          urlPattern: 'https://api.example.com/*',
          methods: ['POST'],
          resourceTypes: ['xhr']
        }
      }
    ])
    const matched: Record<string, string> = {}
    armed.requestHeadersStage(sendHeaders(10, 'https://api.example.com/v1', 'POST', 'xhr'), matched)
    expect(matched).toEqual({ Authorization: 'Bearer x' })
    const otherMethod: Record<string, string> = {}
    armed.requestHeadersStage(
      sendHeaders(10, 'https://api.example.com/v1', 'GET', 'xhr'),
      otherMethod
    )
    expect(otherMethod).toEqual({})
    const otherResourceType: Record<string, string> = {}
    armed.requestHeadersStage(
      sendHeaders(10, 'https://api.example.com/v1', 'POST', 'image'),
      otherResourceType
    )
    expect(otherResourceType).toEqual({})
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
