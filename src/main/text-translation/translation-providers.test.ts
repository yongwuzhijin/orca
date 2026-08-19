import { describe, expect, it, vi } from 'vitest'
import { googleGtxProvider } from './google-gtx-provider'
import { myMemoryProvider } from './mymemory-provider'
import type { TranslationFetch } from './translation-provider'

function fetchReturning(body: string, init?: { ok?: boolean; status?: number }): TranslationFetch {
  return vi.fn(async () => ({
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    text: async () => body
  }))
}

const EN_TO_ZH = { text: 'The cache was cold.', target: 'zh-CN', source: 'en' } as const

describe('googleGtxProvider', () => {
  it('asks for auto source detection and the resolved target', async () => {
    const fetchImpl = fetchReturning('[[["缓存很冷。","The cache was cold."]],null,"en"]')
    await googleGtxProvider.translate(EN_TO_ZH, fetchImpl)
    const url = vi.mocked(fetchImpl).mock.calls[0][0]
    expect(url).toContain('client=gtx')
    expect(url).toContain('sl=auto')
    expect(url).toContain('tl=zh-CN')
    expect(url).toContain('dt=t')
    expect(url).toContain('dt=bd')
    expect(url).toContain('q=The%20cache%20was%20cold.')
  })

  it('returns the parsed translation and detected source', async () => {
    const fetchImpl = fetchReturning('[[["缓存很冷。","The cache was cold."]],null,"en"]')
    await expect(googleGtxProvider.translate(EN_TO_ZH, fetchImpl)).resolves.toEqual({
      ok: true,
      translatedText: '缓存很冷。',
      detectedSourceLanguage: 'en',
      dictionaryEntries: []
    })
  })

  it('returns the dictionary senses when the payload carries them', async () => {
    const fetchImpl = fetchReturning(
      '[[["家属","dependent"]],[["noun",["依赖他人者"],[],"dependent",1]],"en"]'
    )
    await expect(
      googleGtxProvider.translate({ ...EN_TO_ZH, text: 'dependent' }, fetchImpl)
    ).resolves.toMatchObject({
      ok: true,
      dictionaryEntries: [{ partOfSpeech: 'noun', terms: ['依赖他人者'] }]
    })
  })

  it('maps 429 to rate-limited and other failures to provider-error', async () => {
    await expect(
      googleGtxProvider.translate(EN_TO_ZH, fetchReturning('', { ok: false, status: 429 }))
    ).resolves.toEqual({ ok: false, kind: 'rate-limited' })
    await expect(
      googleGtxProvider.translate(EN_TO_ZH, fetchReturning('', { ok: false, status: 503 }))
    ).resolves.toEqual({ ok: false, kind: 'provider-error' })
  })

  it('maps a non-JSON body to provider-error', async () => {
    await expect(
      googleGtxProvider.translate(EN_TO_ZH, fetchReturning('<html>nope</html>'))
    ).resolves.toEqual({ ok: false, kind: 'provider-error' })
  })

  it('maps an aborted request to timeout and a network error to offline', async () => {
    const aborted: TranslationFetch = async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' })
    }
    const unreachable: TranslationFetch = async () => {
      throw new Error('net::ERR_NAME_NOT_RESOLVED')
    }
    await expect(googleGtxProvider.translate(EN_TO_ZH, aborted)).resolves.toEqual({
      ok: false,
      kind: 'timeout'
    })
    await expect(googleGtxProvider.translate(EN_TO_ZH, unreachable)).resolves.toEqual({
      ok: false,
      kind: 'offline'
    })
  })
})

describe('myMemoryProvider', () => {
  it('sends the source|target pair it cannot detect itself', async () => {
    const fetchImpl = fetchReturning(
      '{"responseData":{"translatedText":"缓存很冷。"},"responseStatus":200}'
    )
    await expect(myMemoryProvider.translate(EN_TO_ZH, fetchImpl)).resolves.toEqual({
      ok: true,
      translatedText: '缓存很冷。',
      detectedSourceLanguage: 'en',
      dictionaryEntries: []
    })
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toContain('langpair=en%7Czh-CN')
  })

  it('propagates the body-reported quota refusal as rate-limited', async () => {
    const fetchImpl = fetchReturning(
      '{"responseData":{"translatedText":"x"},"quotaFinished":true,"responseStatus":200}'
    )
    await expect(myMemoryProvider.translate(EN_TO_ZH, fetchImpl)).resolves.toEqual({
      ok: false,
      kind: 'rate-limited'
    })
  })
})
