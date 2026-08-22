import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import {
  createBrowserNetworkResponseOverrideHandler,
  findResponseOverrideRule
} from './browser-network-response-override-handler'

function makeRule(patch: Partial<BrowserNetworkRule> = {}): BrowserNetworkRule {
  return {
    id: 'rule-1',
    label: 'Rule',
    enabled: true,
    match: { urlPattern: 'https://api.test/*' },
    headers: [],
    responseOverride: { statusCode: 418, headers: [], body: 'teapot' },
    ...patch
  }
}

describe('findResponseOverrideRule', () => {
  it('matches on url pattern', () => {
    const rule = makeRule()
    expect(findResponseOverrideRule([rule], { url: 'https://api.test/x', method: 'GET' })).toBe(
      rule
    )
  })

  it('skips a rule with no override', () => {
    const rule = makeRule({ responseOverride: undefined })
    expect(
      findResponseOverrideRule([rule], { url: 'https://api.test/x', method: 'GET' })
    ).toBeNull()
  })

  it('skips a disabled rule', () => {
    const rule = makeRule({ enabled: false })
    expect(
      findResponseOverrideRule([rule], { url: 'https://api.test/x', method: 'GET' })
    ).toBeNull()
  })

  it('skips a non-matching url', () => {
    const rule = makeRule()
    expect(
      findResponseOverrideRule([rule], { url: 'https://other.test/x', method: 'GET' })
    ).toBeNull()
  })

  it('honours a method filter, case-insensitively', () => {
    const rule = makeRule({ match: { urlPattern: 'https://api.test/*', methods: ['post'] } })
    expect(findResponseOverrideRule([rule], { url: 'https://api.test/x', method: 'POST' })).toBe(
      rule
    )
    expect(
      findResponseOverrideRule([rule], { url: 'https://api.test/x', method: 'GET' })
    ).toBeNull()
  })

  it('ignores resourceTypes, which do not map onto the CDP vocabulary', () => {
    const rule = makeRule({
      match: { urlPattern: 'https://api.test/*', resourceTypes: ['xhr'] }
    })
    expect(findResponseOverrideRule([rule], { url: 'https://api.test/x', method: 'GET' })).toBe(
      rule
    )
  })

  it('returns the first match when two rules overlap', () => {
    const first = makeRule({ id: 'a' })
    const second = makeRule({ id: 'b' })
    expect(
      findResponseOverrideRule([first, second], { url: 'https://api.test/x', method: 'GET' })?.id
    ).toBe('a')
  })
})

describe('createBrowserNetworkResponseOverrideHandler', () => {
  const sendCommand = vi.fn(async (_method: string, _params?: unknown) => ({}) as unknown)
  const dbg = { sendCommand } as never

  beforeEach(() => {
    sendCommand.mockClear()
    sendCommand.mockImplementation(async () => ({}))
  })

  const paused = (url: string, method = 'GET'): [unknown, string, unknown] => [
    null,
    'Fetch.requestPaused',
    { requestId: 'req-1', request: { url, method } }
  ]

  it('ignores unrelated CDP messages', () => {
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [makeRule()]
    })
    handler(null, 'Network.responseReceived', {})
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('fulfills a matching request', async () => {
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [makeRule()]
    })
    handler(...paused('https://api.test/x'))
    await vi.waitFor(() => expect(sendCommand).toHaveBeenCalled())
    expect(sendCommand.mock.calls[0][0]).toBe('Fetch.fulfillRequest')
    expect(sendCommand.mock.calls[0][1]).toMatchObject({ requestId: 'req-1', responseCode: 418 })
  })

  it('continues a request no rule matches', async () => {
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [makeRule()]
    })
    handler(...paused('https://other.test/x'))
    await vi.waitFor(() => expect(sendCommand).toHaveBeenCalled())
    expect(sendCommand.mock.calls[0][0]).toBe('Fetch.continueResponse')
    expect(sendCommand.mock.calls[0][1]).toEqual({ requestId: 'req-1' })
  })

  it('continues when rule lookup throws, rather than hanging the page', async () => {
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => {
        throw new Error('rules gone')
      }
    })
    handler(...paused('https://api.test/x'))
    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith('Fetch.continueResponse', { requestId: 'req-1' })
    )
  })

  it('falls back to continue when fulfill fails', async () => {
    sendCommand.mockImplementation(async (method: string) => {
      if (method === 'Fetch.fulfillRequest') {
        throw new Error('already gone')
      }
      return {}
    })
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [makeRule()]
    })
    handler(...paused('https://api.test/x'))
    await vi.waitFor(() => expect(sendCommand).toHaveBeenCalledTimes(2))
    expect(sendCommand.mock.calls[1][0]).toBe('Fetch.continueResponse')
  })

  it('reports but swallows a continue failure', async () => {
    sendCommand.mockImplementation(async () => {
      throw new Error('tab closed')
    })
    const onError = vi.fn()
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [],
      onError
    })
    handler(...paused('https://api.test/x'))
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('tab closed'))
  })

  it('ignores a pause with no request id', () => {
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [makeRule()]
    })
    handler(null, 'Fetch.requestPaused', { request: { url: 'https://api.test/x' } })
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('treats a pause with no request object as unmatched and continues it', async () => {
    const handler = createBrowserNetworkResponseOverrideHandler({
      dbg,
      rulesFor: () => [makeRule()]
    })
    handler(null, 'Fetch.requestPaused', { requestId: 'req-1' })
    await vi.waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith('Fetch.continueResponse', { requestId: 'req-1' })
    )
  })
})
