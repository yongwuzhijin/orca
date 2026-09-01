import { describe, expect, it, vi } from 'vitest'
import {
  joinChatCompletionsUrl,
  requestOpenAiCompatibleTranslation
} from './openai-compatible-translation-client'

const BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const API_KEY = 'sk-testSecret123'
const MODEL = 'qwen-mt-flash'

function successBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { role: 'assistant', content } }]
  })
}

function mockFetch(
  impl: (url: string, init: RequestInit) => Promise<Response> | Response
): typeof fetch {
  return vi.fn(impl) as unknown as typeof fetch
}

describe('joinChatCompletionsUrl', () => {
  it('appends /chat/completions without a trailing slash on baseUrl', () => {
    expect(joinChatCompletionsUrl(BASE)).toBe(`${BASE}/chat/completions`)
  })

  it('strips a trailing slash before joining /chat/completions', () => {
    expect(joinChatCompletionsUrl(`${BASE}/`)).toBe(`${BASE}/chat/completions`)
  })
})

describe('requestOpenAiCompatibleTranslation', () => {
  it('returns parsed content on success', async () => {
    const fetchImpl = mockFetch(async () => Response.json(JSON.parse(successBody('adj. 依赖的'))))
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'translate dependent',
        fetchImpl
      })
    ).resolves.toEqual({ ok: true, text: 'adj. 依赖的' })

    expect(fetchImpl).toHaveBeenCalledWith(
      `${BASE}/chat/completions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'user', content: 'translate dependent' }]
        })
      })
    )
  })

  it('uses the same completions URL when baseUrl has a trailing slash', async () => {
    const fetchImpl = mockFetch(async () => Response.json(JSON.parse(successBody('你好'))))
    await requestOpenAiCompatibleTranslation({
      baseUrl: `${BASE}/`,
      apiKey: API_KEY,
      model: MODEL,
      prompt: 'hello',
      fetchImpl
    })
    expect(fetchImpl).toHaveBeenCalledWith(`${BASE}/chat/completions`, expect.anything())
  })

  it('maps 401 to unauthorized with redacted detail', async () => {
    const fetchImpl = mockFetch(async () =>
      Response.json(
        {
          error: {
            message: `Invalid key sk-leaked with Authorization: Bearer ${API_KEY}`
          }
        },
        { status: 401 }
      )
    )
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'x',
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      kind: 'unauthorized',
      detail: 'Invalid key [redacted] with Authorization: Bearer [redacted]'
    })
  })

  it('maps an aborted signal to aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = mockFetch(async (_url, init) => {
      if (init.signal?.aborted) {
        throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
      }
      return Response.json({})
    })
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'x',
        signal: controller.signal,
        fetchImpl
      })
    ).resolves.toEqual({ ok: false, kind: 'aborted' })
  })

  it('maps empty choices to provider-error', async () => {
    const fetchImpl = mockFetch(async () => Response.json({ choices: [] }))
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'x',
        fetchImpl
      })
    ).resolves.toMatchObject({ ok: false, kind: 'provider-error' })
  })

  it('maps a timeout to timeout', async () => {
    const fetchImpl = mockFetch((_url, init) => {
      return new Promise((_resolve, reject) => {
        const onAbort = (): void => {
          const error = new DOMException('The operation timed out.', 'TimeoutError')
          reject(error)
        }
        if (init.signal?.aborted) {
          onAbort()
          return
        }
        init.signal?.addEventListener('abort', onAbort, { once: true })
      })
    })
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'x',
        timeoutMs: 1,
        fetchImpl
      })
    ).resolves.toEqual({ ok: false, kind: 'timeout' })
  })

  it('maps a network TypeError to offline', async () => {
    const fetchImpl = mockFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'x',
        fetchImpl
      })
    ).resolves.toEqual({ ok: false, kind: 'offline' })
  })

  it('maps other non-2xx responses to provider-error with redacted detail', async () => {
    const fetchImpl = mockFetch(async () =>
      Response.json(
        { error: { message: 'Quota exceeded for sk-secret' } },
        { status: 503, statusText: 'Service Unavailable' }
      )
    )
    await expect(
      requestOpenAiCompatibleTranslation({
        baseUrl: BASE,
        apiKey: API_KEY,
        model: MODEL,
        prompt: 'x',
        fetchImpl
      })
    ).resolves.toEqual({
      ok: false,
      kind: 'provider-error',
      detail: 'Quota exceeded for [redacted]'
    })
  })
})
