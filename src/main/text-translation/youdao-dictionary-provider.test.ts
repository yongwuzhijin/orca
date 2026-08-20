import { describe, expect, it, vi } from 'vitest'
import type { TranslationFetch } from './translation-provider'
import { lookupYoudaoDictionary } from './youdao-dictionary-provider'

const BODY = JSON.stringify({
  result: { msg: 'success', code: 200 },
  data: { entries: [{ entry: 'dependent', explain: 'adj. 依赖的' }] }
})

function respondWith(body: string, init: { ok?: boolean; status?: number } = {}): TranslationFetch {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => body
  }))
}

describe('lookupYoudaoDictionary', () => {
  it('sends the query to the suggest endpoint and returns the parsed entries', async () => {
    const fetchImpl = respondWith(BODY)
    const entries = await lookupYoudaoDictionary('dependent', fetchImpl)
    expect(entries).toEqual([{ headword: 'dependent', explain: 'adj. 依赖的' }])
    const [url] = vi.mocked(fetchImpl).mock.calls[0]
    expect(url).toContain('https://dict.youdao.com/suggest?')
    expect(url).toContain('q=dependent')
    expect(url).toContain('le=en')
  })

  it('percent-encodes a Chinese query', async () => {
    const fetchImpl = respondWith(BODY)
    await lookupYoudaoDictionary('依赖', fetchImpl)
    const [url] = vi.mocked(fetchImpl).mock.calls[0]
    expect(url).toContain(`q=${encodeURIComponent('依赖')}`)
  })

  it('returns nothing when the request rejects', async () => {
    const fetchImpl: TranslationFetch = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(lookupYoudaoDictionary('dependent', fetchImpl)).resolves.toEqual([])
  })

  it('returns nothing when the request times out', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const fetchImpl: TranslationFetch = vi.fn(async () => {
      throw timeout
    })
    await expect(lookupYoudaoDictionary('dependent', fetchImpl)).resolves.toEqual([])
  })

  it('returns nothing on a non-ok HTTP status', async () => {
    const fetchImpl = respondWith(BODY, { ok: false, status: 503 })
    await expect(lookupYoudaoDictionary('dependent', fetchImpl)).resolves.toEqual([])
  })

  it('returns nothing when the body is not JSON', async () => {
    const fetchImpl = respondWith('<html>blocked</html>')
    await expect(lookupYoudaoDictionary('dependent', fetchImpl)).resolves.toEqual([])
  })
})
