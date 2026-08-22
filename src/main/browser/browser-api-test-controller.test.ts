import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BrowserApiTestRequest,
  BrowserApiTestResponse
} from '../../shared/browser-api-test-types'

const guestIdByPageId = new Map<string, number>()
const sessionByWebContentsId = new Map<number, { id: string }>()
const destroyedWebContentsIds = new Set<number>()
const throwingSessionWebContentsIds = new Set<number>()
const throwingLookupPageIds = new Set<string>()
const netRequestCalls: unknown[] = []

type FakeRequest = {
  listeners: Map<string, ((value?: unknown) => void)[]>
  aborted: number
  headers: [string, string][]
  writes: string[]
  ended: number
  on(event: string, listener: (value?: unknown) => void): void
  setHeader(name: string, value: string): void
  write(chunk: string): void
  end(): void
  abort(): void
  emit(event: string, payload?: unknown): void
}

// One fake per net.request call: a shared singleton makes two concurrent sends inexpressible,
// which is exactly what cancel-by-id has to be tested against.
const fakeRequests: FakeRequest[] = []

function createFakeRequest(): FakeRequest {
  return {
    listeners: new Map(),
    aborted: 0,
    headers: [],
    writes: [],
    ended: 0,
    on(event, listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
    },
    setHeader(name, value) {
      this.headers.push([name, value])
    },
    write(chunk) {
      this.writes.push(chunk)
    },
    end() {
      this.ended += 1
    },
    abort() {
      this.aborted += 1
      // Real ClientRequest.abort() emits 'abort' synchronously; a silent fake would hide whether
      // cancellation actually reaches the sender.
      this.emit('abort')
    },
    emit(event, payload) {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(payload)
      }
    }
  }
}

function lastRequest(): FakeRequest {
  const request = fakeRequests.at(-1)
  if (!request) {
    throw new Error('no request was created')
  }
  return request
}

vi.mock('electron', () => ({
  net: {
    request: (options: unknown) => {
      netRequestCalls.push(options)
      const request = createFakeRequest()
      fakeRequests.push(request)
      return request
    }
  },
  webContents: {
    fromId: (id: number) => {
      const session = sessionByWebContentsId.get(id)
      if (!session) {
        return null
      }
      return {
        isDestroyed: () => destroyedWebContentsIds.has(id),
        get session() {
          // A getter, not a field: isDestroyed() can lag the native teardown, and this is the
          // shape that lets a test express "the guard passed but the accessor still threw".
          if (throwingSessionWebContentsIds.has(id)) {
            throw new TypeError('Object has been destroyed')
          }
          return session
        }
      }
    }
  }
}))
vi.mock('./browser-manager', () => ({
  browserManager: {
    getGuestWebContentsId: (pageId: string) => {
      if (throwingLookupPageIds.has(pageId)) {
        throw new TypeError('page registry is gone')
      }
      return guestIdByPageId.get(pageId) ?? null
    }
  }
}))

let cancelBrowserApiTestRequest: (requestId: string) => boolean
let runBrowserApiTestRequest: (request: BrowserApiTestRequest) => Promise<BrowserApiTestResponse>

const REQUEST = {
  browserPageId: 'page-1',
  requestId: 'req-1',
  method: 'GET',
  url: 'https://example.com/api',
  headers: [{ name: 'X-A', value: '1', enabled: true }],
  body: ''
}

beforeEach(async () => {
  // The in-flight map is module state; a fresh module is what keeps these tests order-independent.
  vi.resetModules()
  const controller = await import('./browser-api-test-controller')
  runBrowserApiTestRequest = controller.runBrowserApiTestRequest
  cancelBrowserApiTestRequest = controller.cancelBrowserApiTestRequest

  guestIdByPageId.clear()
  sessionByWebContentsId.clear()
  destroyedWebContentsIds.clear()
  throwingSessionWebContentsIds.clear()
  throwingLookupPageIds.clear()
  netRequestCalls.length = 0
  fakeRequests.length = 0
  guestIdByPageId.set('page-1', 7)
  sessionByWebContentsId.set(7, { id: 'session-7' })
  guestIdByPageId.set('page-2', 9)
  sessionByWebContentsId.set(9, { id: 'session-9' })
})

describe('runBrowserApiTestRequest', () => {
  it('rejects an unknown method before touching the network', async () => {
    const result = await runBrowserApiTestRequest({ ...REQUEST, method: 'TRACE' })
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_method' })
    expect(netRequestCalls).toHaveLength(0)
  })

  it('rejects a non-http URL before touching the network', async () => {
    const result = await runBrowserApiTestRequest({ ...REQUEST, url: 'file:///etc/passwd' })
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_url' })
    expect(netRequestCalls).toHaveLength(0)
  })

  it('blames the method first when both the method and the URL are unusable', async () => {
    const result = await runBrowserApiTestRequest({
      ...REQUEST,
      method: 'TRACE',
      url: 'file:///etc/passwd'
    })
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_method' })
  })

  it('still blames the method on a duplicate id carrying an unusable method', async () => {
    const pending = runBrowserApiTestRequest(REQUEST)
    const rejected = await runBrowserApiTestRequest({ ...REQUEST, method: 'TRACE' })
    expect(rejected).toMatchObject({ status: 'error', reason: 'invalid_method' })
    lastRequest().emit('error', new Error('boom'))
    await pending
  })

  it('reports a pre-flight rejection as zero elapsed time', async () => {
    const result = await runBrowserApiTestRequest({ ...REQUEST, method: 'TRACE' })
    expect(result.durationMs).toBe(0)
  })

  it('reports no_guest when the tab has no live page', async () => {
    guestIdByPageId.delete('page-1')
    const result = await runBrowserApiTestRequest(REQUEST)
    expect(result).toMatchObject({ status: 'error', reason: 'no_guest' })
    expect(netRequestCalls).toHaveLength(0)
  })

  it('reports no_guest when the web contents is gone', async () => {
    sessionByWebContentsId.delete(7)
    const result = await runBrowserApiTestRequest(REQUEST)
    expect(result).toMatchObject({ status: 'error', reason: 'no_guest' })
  })

  it('reports no_guest for a web contents that is mid-teardown', async () => {
    destroyedWebContentsIds.add(7)
    const result = await runBrowserApiTestRequest(REQUEST)
    expect(result).toMatchObject({ status: 'error', reason: 'no_guest' })
    expect(netRequestCalls).toHaveLength(0)
  })

  // Why: an ipcMain.handle caller gets a thrown Error instead of a response if this rejects, and
  // the panel's send button stays disabled behind it — so a throwing accessor must still resolve.
  it('reports no_guest when the session accessor throws behind a false isDestroyed()', async () => {
    throwingSessionWebContentsIds.add(7)
    await expect(runBrowserApiTestRequest(REQUEST)).resolves.toMatchObject({
      status: 'error',
      reason: 'no_guest'
    })
    expect(netRequestCalls).toHaveLength(0)
  })

  it('reports no_guest when the guest id lookup itself throws', async () => {
    throwingLookupPageIds.add('page-1')
    await expect(runBrowserApiTestRequest(REQUEST)).resolves.toMatchObject({
      status: 'error',
      reason: 'no_guest'
    })
    expect(netRequestCalls).toHaveLength(0)
  })

  it("sends with the guest's session and useSessionCookies", async () => {
    const pending = runBrowserApiTestRequest(REQUEST)
    expect(netRequestCalls[0]).toEqual({
      method: 'GET',
      url: 'https://example.com/api',
      session: { id: 'session-7' },
      useSessionCookies: true
    })
    lastRequest().emit('error', new Error('boom'))
    await pending
  })

  it('borrows the session of the page the request names, not some other tab', async () => {
    const pending = runBrowserApiTestRequest({ ...REQUEST, browserPageId: 'page-2' })
    expect(netRequestCalls[0]).toMatchObject({ session: { id: 'session-9' } })
    lastRequest().emit('error', new Error('boom'))
    await pending
  })

  it('normalizes the method and the URL before handing them to the sender', async () => {
    const pending = runBrowserApiTestRequest({
      ...REQUEST,
      method: 'post',
      url: '  https://example.com  '
    })
    expect(netRequestCalls[0]).toMatchObject({ method: 'POST', url: 'https://example.com/' })
    lastRequest().emit('error', new Error('boom'))
    await pending
  })

  it('forwards the enabled headers and the body to the wire', async () => {
    const pending = runBrowserApiTestRequest({
      ...REQUEST,
      method: 'POST',
      body: '{"a":1}',
      headers: [
        { name: 'X-A', value: '1', enabled: true },
        { name: 'X-Off', value: 'no', enabled: false }
      ]
    })
    expect(lastRequest().headers).toEqual([['X-A', '1']])
    expect(lastRequest().writes).toEqual(['{"a":1}'])
    expect(lastRequest().ended).toBe(1)
    lastRequest().emit('error', new Error('boom'))
    await pending
  })

  it('hands a successful response back untouched', async () => {
    const pending = runBrowserApiTestRequest(REQUEST)
    const request = lastRequest()
    const responseListeners = new Map<string, ((value?: unknown) => void)[]>()
    request.emit('response', {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': 'application/json' },
      on: (event: string, listener: (value?: unknown) => void) => {
        responseListeners.set(event, [...(responseListeners.get(event) ?? []), listener])
      }
    })
    const emitResponse = (event: string, payload?: unknown): void => {
      for (const listener of responseListeners.get(event) ?? []) {
        listener(payload)
      }
    }
    emitResponse('data', Buffer.from('{"ok":true}'))
    emitResponse('end')
    await expect(pending).resolves.toMatchObject({
      status: 'ok',
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-type': ['application/json'] },
      body: '{"ok":true}',
      bodyBytes: 11,
      truncated: false,
      textual: true
    })
  })

  it('reports the elapsed time measured by the real clock', async () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_250)
    const pending = runBrowserApiTestRequest(REQUEST)
    lastRequest().emit('error', new Error('boom'))
    await expect(pending).resolves.toMatchObject({ durationMs: 250 })
    nowSpy.mockRestore()
  })

  it('rejects a second send that reuses an in-flight requestId', async () => {
    const pending = runBrowserApiTestRequest(REQUEST)
    const rejected = await runBrowserApiTestRequest(REQUEST)
    expect(rejected).toMatchObject({ status: 'error', reason: 'busy' })
    expect(netRequestCalls).toHaveLength(1)
    lastRequest().emit('error', new Error('boom'))
    await pending
  })

  it('frees the requestId after it settles', async () => {
    const first = runBrowserApiTestRequest(REQUEST)
    lastRequest().emit('error', new Error('boom'))
    await first
    expect(cancelBrowserApiTestRequest('req-1')).toBe(false)
    const second = runBrowserApiTestRequest(REQUEST)
    expect(netRequestCalls).toHaveLength(2)
    lastRequest().emit('error', new Error('boom'))
    await second
  })
})

describe('cancelBrowserApiTestRequest', () => {
  it('aborts an in-flight request', async () => {
    const pending = runBrowserApiTestRequest(REQUEST)
    expect(cancelBrowserApiTestRequest('req-1')).toBe(true)
    expect(lastRequest().aborted).toBe(1)
    await expect(pending).resolves.toMatchObject({ status: 'error', reason: 'aborted' })
  })

  it('aborts only the request the id names', async () => {
    const first = runBrowserApiTestRequest(REQUEST)
    const second = runBrowserApiTestRequest({ ...REQUEST, requestId: 'req-2' })
    expect(cancelBrowserApiTestRequest('req-2')).toBe(true)
    expect(fakeRequests[0].aborted).toBe(0)
    expect(fakeRequests[1].aborted).toBe(1)
    await expect(second).resolves.toMatchObject({ reason: 'aborted' })
    fakeRequests[0].emit('error', new Error('boom'))
    await first
  })

  it('keeps owning the id until the send settles, not merely until cancel returns', async () => {
    const pending = runBrowserApiTestRequest(REQUEST)
    expect(cancelBrowserApiTestRequest('req-1')).toBe(true)
    expect(cancelBrowserApiTestRequest('req-1')).toBe(true)
    await pending
    expect(cancelBrowserApiTestRequest('req-1')).toBe(false)
  })

  it('returns false for an unknown id', () => {
    expect(cancelBrowserApiTestRequest('nope')).toBe(false)
  })
})
