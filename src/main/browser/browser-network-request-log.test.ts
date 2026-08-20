import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_NETWORK_LOG_MAX_ENTRIES } from '../../shared/browser-network-log-types'
import { createBrowserNetworkRequestLog } from './browser-network-request-log'

const PAGE_BY_WEB_CONTENTS = new Map<number, string>([
  [10, 'page-1'],
  [20, 'page-2']
])

// Why: spied so the "never asked" half of recordStart's guard pair stays observable.
const resolvePageId = vi.fn(
  (webContentsId: number): string | null => PAGE_BY_WEB_CONTENTS.get(webContentsId) ?? null
)

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

const received = (id: number, statusCode: number, responseHeaders?: Record<string, string[]>) =>
  ({ id, statusCode, responseHeaders }) as Electron.OnHeadersReceivedListenerDetails

// Why: Electron types fromCache as required on both terminal events, so fixtures must carry it.
const completed = (id: number, statusCode: number, fromCache = false) =>
  ({ id, statusCode, fromCache }) as Electron.OnCompletedListenerDetails

const failed = (id: number, error: string) =>
  ({ id, error, fromCache: false }) as Electron.OnErrorOccurredListenerDetails

describe('browser network request log', () => {
  beforeEach(() => {
    resolvePageId.mockClear()
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

  it('never asks for a page when the request carries no WebContents id', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, undefined))
    expect(resolvePageId).not.toHaveBeenCalled()
    expect(log.read('page-1', 50).entries).toEqual([])
  })

  it('ignores a request whose WebContents resolves to no page', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 999))
    expect(resolvePageId).toHaveBeenCalledWith(999)
    expect(log.read('page-1', 50).entries.map((entry) => entry.id)).toEqual([1])
    expect(log.read('page-2', 50).entries).toEqual([])
    // An unlogged request must not claim the in-flight slot of a logged one reusing its id.
    log.recordStart(start(1, 999))
    log.recordCompletion(completed(1, 200))
    expect(log.read('page-1', 50).entries[0]).toMatchObject({ statusCode: 200 })
    log.recordCompletion(completed(2, 500))
    expect(log.read('page-1', 50).entries.map((entry) => entry.id)).toEqual([1])
    expect(log.read('page-2', 50).entries).toEqual([])
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
    log.recordResponseHeaders(received(2, 404, { ...RESPONSE_HEADERS }))
    const byId = new Map(log.read('page-1', 50).entries.map((entry) => [entry.id, entry]))
    expect(byId.get(2)).toMatchObject({ statusCode: 404, responseHeaders: { Server: ['nginx'] } })
    expect(byId.get(1)?.statusCode).toBeUndefined()
  })

  it('ignores a response for a request it never saw start', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordResponseHeaders(received(77, 200))
    expect(log.read('page-1', 50).entries).toEqual([])
  })

  it('snapshots request headers rather than aliasing the live details object', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    const requestHeaders: Record<string, string> = { Accept: 'text/html' }
    log.recordStart({ ...start(1, 10), requestHeaders })
    requestHeaders.Accept = 'rewritten-after-send'
    expect(log.read('page-1', 50).entries[0]?.requestHeaders).toEqual({ Accept: 'text/html' })
  })

  it('snapshots response headers rather than aliasing the live details object', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    const responseHeaders: Record<string, string[]> = {
      Server: ['caddy'],
      'Set-Cookie': ['a=1']
    }
    log.recordResponseHeaders(received(1, 200, responseHeaders))
    responseHeaders.Server = ['rewritten-after-receive']
    // A response-override edits a header array in place, which a shallow spread would let through.
    responseHeaders['Set-Cookie']?.push('b=2')
    expect(log.read('page-1', 50).entries[0]?.responseHeaders).toEqual({
      Server: ['caddy'],
      'Set-Cookie': ['a=1']
    })
  })

  it('stamps a duration and the cache flag on completion', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    vi.setSystemTime(1_250)
    log.recordCompletion(completed(1, 200, true))
    expect(log.read('page-1', 50).entries[0]).toMatchObject({
      statusCode: 200,
      fromCache: true,
      durationMs: 250
    })
  })

  it('ignores a second terminal event for the same request id', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    vi.setSystemTime(1_250)
    log.recordCompletion(completed(1, 200))
    expect(log.read('page-1', 50).entries[0]).toMatchObject({ durationMs: 250 })
    vi.setSystemTime(2_000)
    log.recordCompletion(completed(1, 200))
    expect(log.read('page-1', 50).entries[0]?.durationMs).toBe(250)
  })

  // Electron reuses one request id across a redirect chain, so every hop is its own recordStart.
  it('logs every hop of a redirect chain under the reused request id', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(0, 10, 'https://a.com/hop1'))
    log.recordResponseHeaders(received(0, 301))
    log.recordStart(start(0, 10, 'https://a.com/hop2'))
    log.recordResponseHeaders(received(0, 200))
    log.recordCompletion(completed(0, 200))
    const { entries } = log.read('page-1', 50)
    expect(entries.map((entry) => entry.url)).toEqual(['https://a.com/hop2', 'https://a.com/hop1'])
    expect(entries[0]).toMatchObject({ statusCode: 200, durationMs: 0 })
    // Only the last hop is finished, so the superseded hop keeps its status and no duration.
    expect(entries[1]).toMatchObject({ statusCode: 301 })
    expect(entries[1]?.durationMs).toBeUndefined()
  })

  it('completes a still-in-flight redirect hop whose predecessor was evicted', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(0, 10, 'https://a.com/hop1'))
    log.recordResponseHeaders(received(0, 301))
    log.recordStart(start(0, 10, 'https://a.com/hop2'))
    // Push hop1 out of the buffer while hop2 still owns the shared id's in-flight record.
    for (let index = 1; index < BROWSER_NETWORK_LOG_MAX_ENTRIES; index += 1) {
      log.recordStart(start(index, 10, `https://a.com/${index}`))
    }
    vi.setSystemTime(1_400)
    log.recordCompletion(completed(0, 200))
    const { entries } = log.read('page-1', BROWSER_NETWORK_LOG_MAX_ENTRIES)
    expect(entries.map((entry) => entry.url)).not.toContain('https://a.com/hop1')
    expect(entries.at(-1)).toMatchObject({
      url: 'https://a.com/hop2',
      statusCode: 200,
      durationMs: 400
    })
  })

  it('clamps a backwards system clock to a zero duration', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    vi.setSystemTime(500)
    log.recordCompletion(completed(1, 200))
    expect(log.read('page-1', 50).entries[0]?.durationMs).toBe(0)
  })

  it('records the error text when a request fails', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    vi.setSystemTime(1_100)
    log.recordError(failed(1, 'net::ERR_CONNECTION_REFUSED'))
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

  it('returns the whole buffer when the limit sits above it, rather than a suffix', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 10))
    log.recordStart(start(3, 10))
    const { entries, truncated } = log.read('page-1', 5)
    expect(entries.map((entry) => entry.id)).toEqual([3, 2, 1])
    expect(truncated).toBe(false)
  })

  // The limit arrives from the renderer over IPC, so a negative value is reachable.
  it('clamps a negative limit to an empty read', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    expect(log.read('page-1', -1)).toEqual({ entries: [], truncated: true })
    // An empty buffer has nothing left over to truncate, even for a nonsense limit.
    expect(log.read('page-2', -1)).toEqual({ entries: [], truncated: false })
  })

  // Structured clone hands NaN across IPC intact, so it must not read as "no limit".
  it('reads nothing for a NaN limit and still reports the buffer as truncated', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 10))
    log.recordStart(start(3, 10))
    expect(log.read('page-1', Number.NaN)).toEqual({ entries: [], truncated: true })
  })

  it('floors a fractional limit rather than overshooting it', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    log.recordStart(start(1, 10))
    log.recordStart(start(2, 10))
    log.recordStart(start(3, 10))
    const { entries, truncated } = log.read('page-1', 2.5)
    expect(entries.map((entry) => entry.id)).toEqual([3, 2])
    expect(truncated).toBe(true)
  })

  it('keeps an evicted request out of reads even when its completion arrives later', () => {
    const log = createBrowserNetworkRequestLog(resolvePageId)
    for (let index = 0; index < BROWSER_NETWORK_LOG_MAX_ENTRIES + 1; index += 1) {
      log.recordStart(start(index, 10, `https://a.com/${index}`))
    }
    log.recordCompletion(completed(0, 200))
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
    log.recordCompletion(completed(1, 200))
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
