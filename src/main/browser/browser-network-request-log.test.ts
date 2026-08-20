import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_NETWORK_LOG_MAX_ENTRIES,
  createBrowserNetworkRequestLog
} from './browser-network-request-log'

const PAGE_BY_WEB_CONTENTS = new Map<number, string>([
  [10, 'page-1'],
  [20, 'page-2']
])

const resolvePageId = (webContentsId: number): string | null =>
  PAGE_BY_WEB_CONTENTS.get(webContentsId) ?? null

// Why: Electron types these as Record maps, which are not comparable to inline literal types.
const REQUEST_HEADERS: Record<string, string> = { Accept: '*/*' }
const RESPONSE_HEADERS: Record<string, string[]> = { Server: ['nginx'] }

const start = (id: number, webContentsId: number | undefined, url = 'https://a.com/x') =>
  ({
    id,
    url,
    method: 'GET',
    resourceType: 'xhr',
    timestamp: 0,
    webContentsId,
    requestHeaders: { ...REQUEST_HEADERS }
  }) as Electron.OnBeforeSendHeadersListenerDetails

describe('browser network request log', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records a started request under its owning page', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    expect(log.read('page-1', 50)).toEqual({
      entries: [
        {
          id: 1,
          url: 'https://a.com/x',
          method: 'GET',
          resourceType: 'xhr',
          startedAt: 1_000,
          requestHeaders: { Accept: '*/*' }
        }
      ],
      truncated: false
    })
  })

  it('ignores a request with no owning WebContents', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, undefined))
    log.recordStart(start(2, 999))
    expect(log.read('page-1', 50).entries).toEqual([])
  })

  it('keeps sibling pages in separate buffers', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10, 'https://a.com/one'))
    log.recordStart(start(2, 20, 'https://a.com/two'))
    expect(log.read('page-1', 50).entries.map((entry) => entry.url)).toEqual(['https://a.com/one'])
    expect(log.read('page-2', 50).entries.map((entry) => entry.url)).toEqual(['https://a.com/two'])
  })

  it('attaches response headers and the status to the matching request id', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 10))
    log.recordResponseHeaders({
      id: 2,
      statusCode: 404,
      responseHeaders: { ...RESPONSE_HEADERS }
    } as Electron.OnHeadersReceivedListenerDetails)
    const byId = new Map(log.read('page-1', 50).entries.map((entry) => [entry.id, entry]))
    expect(byId.get(2)).toMatchObject({ statusCode: 404, responseHeaders: { Server: ['nginx'] } })
    expect(byId.get(1)?.statusCode).toBeUndefined()
  })

  it('ignores a response for a request it never saw start', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordResponseHeaders({
      id: 77,
      statusCode: 200
    } as Electron.OnHeadersReceivedListenerDetails)
    expect(log.read('page-1', 50).entries).toEqual([])
  })

  it('stamps a duration and the cache flag on completion', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    vi.setSystemTime(1_250)
    log.recordCompletion({
      id: 1,
      statusCode: 200,
      fromCache: true
    } as Electron.OnCompletedListenerDetails)
    expect(log.read('page-1', 50).entries[0]).toMatchObject({
      statusCode: 200,
      fromCache: true,
      durationMs: 250
    })
  })

  it('records the error text when a request fails', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    vi.setSystemTime(1_100)
    log.recordError({
      id: 1,
      error: 'net::ERR_CONNECTION_REFUSED'
    } as Electron.OnErrorOccurredListenerDetails)
    expect(log.read('page-1', 50).entries[0]).toMatchObject({
      error: 'net::ERR_CONNECTION_REFUSED',
      durationMs: 100
    })
  })

  it('returns entries newest first', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10, 'https://a.com/first'))
    log.recordStart(start(2, 10, 'https://a.com/second'))
    expect(log.read('page-1', 50).entries.map((entry) => entry.url)).toEqual([
      'https://a.com/second',
      'https://a.com/first'
    ])
  })

  it('drops the oldest entry once the cap is reached', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    for (let index = 0; index < BROWSER_NETWORK_LOG_MAX_ENTRIES + 5; index += 1) {
      log.recordStart(start(index, 10, `https://a.com/${index}`))
    }
    const { entries, truncated } = log.read('page-1', BROWSER_NETWORK_LOG_MAX_ENTRIES)
    expect(entries).toHaveLength(BROWSER_NETWORK_LOG_MAX_ENTRIES)
    expect(entries.at(-1)?.url).toBe('https://a.com/5')
    // The buffer itself was capped, not just this read: nothing was left over to truncate.
    expect(truncated).toBe(false)
  })

  it('flags a read that was cut short by the limit', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 10))
    log.recordStart(start(3, 10))
    const { entries, truncated } = log.read('page-1', 2)
    expect(entries).toHaveLength(2)
    expect(truncated).toBe(true)
  })

  it('ignores a completion for an evicted request', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    for (let index = 0; index < BROWSER_NETWORK_LOG_MAX_ENTRIES + 1; index += 1) {
      log.recordStart(start(index, 10, `https://a.com/${index}`))
    }
    log.recordCompletion({ id: 0, statusCode: 200 } as Electron.OnCompletedListenerDetails)
    // Read above the cap so the absence is the eviction, not this read's own limit.
    const { entries } = log.read('page-1', BROWSER_NETWORK_LOG_MAX_ENTRIES + 5)
    expect(entries).toHaveLength(BROWSER_NETWORK_LOG_MAX_ENTRIES)
    expect(entries.some((entry) => entry.id === 0)).toBe(false)
  })

  it('clears one page without touching its sibling', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 20))
    log.clear('page-1')
    expect(log.read('page-1', 50).entries).toEqual([])
    expect(log.read('page-2', 50).entries).toHaveLength(1)
  })

  it('ignores a completion for a cleared page', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.clear('page-1')
    log.recordCompletion({ id: 1, statusCode: 200 } as Electron.OnCompletedListenerDetails)
    expect(log.read('page-1', 50).entries).toEqual([])
  })

  it('starts a fresh buffer after clearing a page', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10, 'https://a.com/old'))
    log.clear('page-1')
    log.recordStart(start(2, 10, 'https://a.com/new'))
    expect(log.read('page-1', 50).entries.map((entry) => entry.url)).toEqual(['https://a.com/new'])
  })
})
