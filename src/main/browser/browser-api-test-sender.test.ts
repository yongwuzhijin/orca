import { describe, expect, it, vi } from 'vitest'
import { BROWSER_API_TEST_TIMEOUT_MS } from '../../shared/browser-api-test-types'
import {
  sendBrowserApiTestRequest,
  type BrowserApiTestClientRequest,
  type BrowserApiTestIncomingMessage,
  type BrowserApiTestSenderDeps
} from './browser-api-test-sender'

type Listener = (...args: never[]) => void

function createFakeRequest(): {
  request: BrowserApiTestClientRequest
  emit: (event: string, payload?: unknown) => void
  written: string[]
  ended: () => boolean
  aborted: () => number
  headers: Record<string, string>
} {
  const listeners = new Map<string, Listener[]>()
  const written: string[] = []
  const headers: Record<string, string> = {}
  let endCount = 0
  let abortCount = 0
  const request = {
    on: (event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    },
    setHeader: (name: string, value: string) => {
      headers[name] = value
    },
    write: (chunk: string) => {
      written.push(chunk)
    },
    end: () => {
      endCount += 1
    },
    abort: () => {
      abortCount += 1
      // Real ClientRequest.abort() emits 'abort' synchronously; a silent fake would hide the
      // resolve-then-abort ordering the cap path depends on.
      for (const listener of listeners.get('abort') ?? []) {
        ;(listener as () => void)()
      }
    }
  } as unknown as BrowserApiTestClientRequest
  return {
    request,
    emit: (event, payload) => {
      for (const listener of listeners.get(event) ?? []) {
        ;(listener as (value?: unknown) => void)(payload)
      }
    },
    written,
    ended: () => endCount > 0,
    aborted: () => abortCount,
    headers
  }
}

function createFakeResponse(
  init: {
    statusCode?: number
    statusMessage?: string
    headers?: Record<string, string | string[]>
  } = {}
): { response: BrowserApiTestIncomingMessage; emit: (event: string, payload?: unknown) => void } {
  const listeners = new Map<string, Listener[]>()
  const response = {
    statusCode: init.statusCode ?? 200,
    statusMessage: init.statusMessage ?? 'OK',
    headers: init.headers ?? { 'content-type': 'application/json' },
    on: (event: string, listener: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener])
    }
  } as unknown as BrowserApiTestIncomingMessage
  return {
    response,
    emit: (event, payload) => {
      for (const listener of listeners.get(event) ?? []) {
        ;(listener as (value?: unknown) => void)(payload)
      }
    }
  }
}

const BASE = {
  method: 'POST' as const,
  url: 'https://example.com/api',
  headers: { 'X-Token': 'abc' },
  body: '{"a":1}',
  session: { id: 'session' }
}

describe('sendBrowserApiTestRequest', () => {
  it('sends headers and body, then resolves with the response', async () => {
    const fake = createFakeRequest()
    const times = [1000, 1250]
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => times.shift() ?? 1250
    })
    const res = createFakeResponse({ statusCode: 201, statusMessage: 'Created' })
    fake.emit('response', res.response)
    res.emit('data', Buffer.from('{"ok":true}'))
    res.emit('end')
    const result = await handle.result

    expect(fake.headers).toEqual({ 'X-Token': 'abc' })
    expect(fake.written).toEqual(['{"a":1}'])
    expect(fake.ended()).toBe(true)
    expect(result).toEqual({
      status: 'ok',
      statusCode: 201,
      statusMessage: 'Created',
      headers: { 'content-type': ['application/json'] },
      body: '{"ok":true}',
      bodyBytes: 11,
      truncated: false,
      textual: true,
      durationMs: 250
    })
  })

  it('passes useSessionCookies and never passes credentials', () => {
    const fake = createFakeRequest()
    const createRequest = vi.fn<BrowserApiTestSenderDeps['createRequest']>(() => fake.request)
    sendBrowserApiTestRequest(BASE, { createRequest, now: () => 0 })
    expect(createRequest).toHaveBeenCalledWith({
      method: 'POST',
      url: 'https://example.com/api',
      session: BASE.session,
      useSessionCookies: true
    })
    expect(createRequest.mock.calls[0]?.[0]).not.toHaveProperty('credentials')
  })

  it('omits the body for GET', () => {
    const fake = createFakeRequest()
    sendBrowserApiTestRequest(
      { ...BASE, method: 'GET', body: 'ignored' },
      { createRequest: () => fake.request, now: () => 0 }
    )
    expect(fake.written).toEqual([])
    expect(fake.ended()).toBe(true)
  })

  it('writes nothing when the body is empty', () => {
    const fake = createFakeRequest()
    sendBrowserApiTestRequest(
      { ...BASE, body: '' },
      { createRequest: () => fake.request, now: () => 0 }
    )
    expect(fake.written).toEqual([])
    expect(fake.ended()).toBe(true)
  })

  it('reports a transport error', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0
    })
    fake.emit('error', new Error('ENOTFOUND'))
    await expect(handle.result).resolves.toEqual({
      status: 'error',
      reason: 'network',
      message: 'ENOTFOUND',
      durationMs: 0
    })
  })

  it('measures a failure duration from the start of the send', async () => {
    const fake = createFakeRequest()
    const times = [1000, 1400]
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => times.shift() ?? 1400
    })
    fake.emit('error', new Error('ENOTFOUND'))
    await expect(handle.result).resolves.toMatchObject({ durationMs: 400 })
  })

  it('reports a synchronous createRequest throw instead of rejecting', async () => {
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => {
        throw new Error('bad url')
      },
      now: () => 0
    })
    // .resolves, not `await handle.result`: a raw rejection must read as a failed assertion.
    await expect(handle.result).resolves.toMatchObject({
      status: 'error',
      reason: 'network',
      message: 'bad url'
    })
  })

  it('times out and aborts the request', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeRequest()
      const handle = sendBrowserApiTestRequest(BASE, {
        createRequest: () => fake.request,
        now: () => 0,
        timeoutMs: 50
      })
      vi.advanceTimersByTime(50)
      expect(fake.aborted()).toBe(1)
      await expect(handle.result).resolves.toMatchObject({ status: 'error', reason: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('defaults to the 30s budget', () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeRequest()
      sendBrowserApiTestRequest(BASE, { createRequest: () => fake.request, now: () => 0 })
      vi.advanceTimersByTime(BROWSER_API_TEST_TIMEOUT_MS - 1)
      expect(fake.aborted()).toBe(0)
      vi.advanceTimersByTime(1)
      expect(fake.aborted()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the timeout once it has settled', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeRequest()
      const handle = sendBrowserApiTestRequest(BASE, {
        createRequest: () => fake.request,
        now: () => 0,
        timeoutMs: 50
      })
      const res = createFakeResponse()
      fake.emit('response', res.response)
      res.emit('end')
      await handle.result
      vi.advanceTimersByTime(50)
      expect(fake.aborted()).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancel() aborts and reports aborted', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0
    })
    handle.cancel()
    expect(fake.aborted()).toBe(1)
    await expect(handle.result).resolves.toMatchObject({ status: 'error', reason: 'aborted' })
  })

  it('cancel() after settling is a no-op', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0
    })
    const res = createFakeResponse()
    fake.emit('response', res.response)
    res.emit('end')
    await handle.result
    handle.cancel()
    expect(fake.aborted()).toBe(0)
  })

  it('stops at the cap, marks truncated, and aborts the transfer', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0,
      maxBodyBytes: 4
    })
    const res = createFakeResponse({ headers: { 'content-type': 'text/plain' } })
    fake.emit('response', res.response)
    res.emit('data', Buffer.from('ab'))
    res.emit('data', Buffer.from('cdef'))
    const result = await handle.result
    expect(result).toMatchObject({ status: 'ok', body: 'ab', bodyBytes: 6, truncated: true })
    expect(fake.aborted()).toBe(1)
  })

  it('keeps a body that exactly fills the cap', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0,
      maxBodyBytes: 4
    })
    const res = createFakeResponse({ headers: { 'content-type': 'text/plain' } })
    fake.emit('response', res.response)
    res.emit('data', Buffer.from('abcd'))
    res.emit('end')
    await expect(handle.result).resolves.toMatchObject({ body: 'abcd', truncated: false })
    expect(fake.aborted()).toBe(0)
  })

  it('reports size without a body for a binary response', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0
    })
    const res = createFakeResponse({
      headers: { 'content-type': 'image/png', 'content-length': '2048' }
    })
    fake.emit('response', res.response)
    res.emit('data', Buffer.from([1, 2, 3]))
    res.emit('end')
    await expect(handle.result).resolves.toMatchObject({
      status: 'ok',
      textual: false,
      body: '',
      bodyBytes: 2048
    })
  })

  // Why: Number() turns '' into 0 and accepts '-5', either of which would report a body the
  // response plainly did not have.
  it('ignores a blank or negative content-length', async () => {
    for (const contentLength of ['', '  ', '-5', 'nope']) {
      const fake = createFakeRequest()
      const handle = sendBrowserApiTestRequest(BASE, {
        createRequest: () => fake.request,
        now: () => 0
      })
      const res = createFakeResponse({
        headers: { 'content-type': 'text/plain', 'content-length': contentLength }
      })
      fake.emit('response', res.response)
      res.emit('data', Buffer.from('hello'))
      res.emit('end')
      await expect(handle.result).resolves.toMatchObject({ body: 'hello', bodyBytes: 5 })
    }
  })

  // Why: setHeader runs inside the promise executor, so a header name the user typed used to
  // reject the result promise and leave the 30s timer armed on a request nobody owned.
  it('reports a throwing setHeader instead of rejecting, and clears the timeout', async () => {
    vi.useFakeTimers()
    try {
      const fake = createFakeRequest()
      const throwing = {
        ...fake.request,
        setHeader: () => {
          throw new Error('invalid header name: X A')
        }
      } as unknown as BrowserApiTestClientRequest
      const handle = sendBrowserApiTestRequest(BASE, {
        createRequest: () => throwing,
        now: () => 0
      })
      await expect(handle.result).resolves.toMatchObject({
        status: 'error',
        reason: 'network',
        message: 'invalid header name: X A'
      })
      expect(vi.getTimerCount()).toBe(0)
      expect(fake.aborted()).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a mid-stream response error', async () => {
    const fake = createFakeRequest()
    const handle = sendBrowserApiTestRequest(BASE, {
      createRequest: () => fake.request,
      now: () => 0
    })
    const res = createFakeResponse()
    fake.emit('response', res.response)
    res.emit('error', new Error('socket hang up'))
    await expect(handle.result).resolves.toMatchObject({
      status: 'error',
      reason: 'network',
      message: 'socket hang up'
    })
  })
})
