import { describe, expect, it, vi } from 'vitest'
import { TRANSLATION_INPUT_MAX_LENGTH } from '../../shared/text-translation-types'
import { translateText } from './translation-service'
import type { TranslationProvider, TranslationProviderResult } from './translation-provider'

function stubProvider(
  id: TranslationProvider['id'],
  result: TranslationProviderResult
): TranslationProvider {
  return { id, translate: vi.fn(async () => result) }
}

const SUCCESS: TranslationProviderResult = {
  ok: true,
  translatedText: '缓存很冷。',
  detectedSourceLanguage: 'en',
  dictionaryEntries: []
}

const noFetch = (() => {
  throw new Error('unused')
}) as never

describe('translateText', () => {
  it('returns the primary provider result without calling the fallback', async () => {
    const primary = stubProvider('google-gtx', SUCCESS)
    const fallback = stubProvider('mymemory', SUCCESS)
    await expect(
      translateText(
        { text: 'The cache was cold.', preference: 'auto' },
        { providers: [primary, fallback], fetchImpl: noFetch }
      )
    ).resolves.toEqual({
      ok: true,
      translatedText: '缓存很冷。',
      targetLanguage: 'zh-CN',
      detectedSourceLanguage: 'en',
      providerId: 'google-gtx',
      dictionaryEntries: [],
      queriedText: 'The cache was cold.'
    })
    expect(fallback.translate).not.toHaveBeenCalled()
  })

  it('falls through to the fallback provider when the primary fails', async () => {
    const primary = stubProvider('google-gtx', { ok: false, kind: 'rate-limited' })
    const fallback = stubProvider('mymemory', { ...SUCCESS, detectedSourceLanguage: null })
    await expect(
      translateText(
        { text: 'The cache was cold.', preference: 'auto' },
        { providers: [primary, fallback], fetchImpl: noFetch }
      )
    ).resolves.toEqual({
      ok: true,
      translatedText: '缓存很冷。',
      targetLanguage: 'zh-CN',
      detectedSourceLanguage: null,
      providerId: 'mymemory',
      dictionaryEntries: [],
      queriedText: 'The cache was cold.'
    })
  })

  it('passes the dictionary senses through untouched', async () => {
    const entries = [{ partOfSpeech: 'noun', terms: ['依赖他人者'] }]
    const primary = stubProvider('google-gtx', { ...SUCCESS, dictionaryEntries: entries })
    await expect(
      translateText(
        { text: 'dependent', preference: 'auto' },
        { providers: [primary], fetchImpl: noFetch }
      )
    ).resolves.toMatchObject({ ok: true, dictionaryEntries: entries })
  })

  it('lowercases a shouted word and reports what it actually queried', async () => {
    const primary = stubProvider('google-gtx', SUCCESS)
    await expect(
      translateText(
        { text: 'DEPENDENT', preference: 'auto' },
        { providers: [primary], fetchImpl: noFetch }
      )
    ).resolves.toMatchObject({ ok: true, queriedText: 'dependent' })
    expect(primary.translate).toHaveBeenCalledWith(
      { text: 'dependent', target: 'zh-CN', source: 'en' },
      noFetch
    )
  })

  it('surfaces the primary failure when every provider fails', async () => {
    // Why: the fallback's error is noise; the user cares why the main path broke.
    const primary = stubProvider('google-gtx', { ok: false, kind: 'offline' })
    const fallback = stubProvider('mymemory', { ok: false, kind: 'provider-error' })
    await expect(
      translateText(
        { text: 'hello', preference: 'auto' },
        { providers: [primary, fallback], fetchImpl: noFetch }
      )
    ).resolves.toEqual({ ok: false, kind: 'offline' })
  })

  it('passes the resolved direction pair to the provider', async () => {
    const primary = stubProvider('google-gtx', SUCCESS)
    await translateText(
      { text: '这个接口返回值被缓存了', preference: 'auto' },
      { providers: [primary], fetchImpl: noFetch }
    )
    expect(primary.translate).toHaveBeenCalledWith(
      { text: '这个接口返回值被缓存了', target: 'en', source: 'zh-CN' },
      noFetch
    )
  })

  it('sends trimmed text and honours a forced direction', async () => {
    const primary = stubProvider('google-gtx', SUCCESS)
    await translateText(
      { text: '  The cache was cold.\n', preference: 'en' },
      { providers: [primary], fetchImpl: noFetch }
    )
    expect(primary.translate).toHaveBeenCalledWith(
      { text: 'The cache was cold.', target: 'en', source: 'zh-CN' },
      noFetch
    )
  })

  it('rejects blank input before making a request', async () => {
    const primary = stubProvider('google-gtx', SUCCESS)
    await expect(
      translateText(
        { text: '   \n ', preference: 'auto' },
        { providers: [primary], fetchImpl: noFetch }
      )
    ).resolves.toEqual({ ok: false, kind: 'invalid-input' })
    expect(primary.translate).not.toHaveBeenCalled()
  })

  it('rejects input longer than the cap before making a request', async () => {
    const primary = stubProvider('google-gtx', SUCCESS)
    await expect(
      translateText(
        { text: 'a'.repeat(TRANSLATION_INPUT_MAX_LENGTH + 1), preference: 'auto' },
        { providers: [primary], fetchImpl: noFetch }
      )
    ).resolves.toEqual({ ok: false, kind: 'too-long' })
    expect(primary.translate).not.toHaveBeenCalled()
  })

  it('treats a thrown provider as a provider error instead of rejecting', async () => {
    const primary: TranslationProvider = {
      id: 'google-gtx',
      translate: vi.fn(async () => {
        throw new Error('boom')
      })
    }
    const fallback = stubProvider('mymemory', SUCCESS)
    await expect(
      translateText(
        { text: 'hello', preference: 'auto' },
        { providers: [primary, fallback], fetchImpl: noFetch }
      )
    ).resolves.toMatchObject({ ok: true, providerId: 'mymemory' })
  })
})
