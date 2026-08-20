import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'

const {
  handleMock,
  removeHandlerMock,
  translateTextMock,
  translateWithAiMock,
  cancelAiMock,
  lookupDictionaryMock
} = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  translateTextMock: vi.fn(),
  translateWithAiMock: vi.fn(),
  cancelAiMock: vi.fn(),
  lookupDictionaryMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock }
}))

vi.mock('../text-translation/translation-fetch', () => ({ translationFetch: vi.fn() }))

vi.mock('../text-translation/translation-service', () => ({ translateText: translateTextMock }))

vi.mock('../text-translation/ai-translation', () => ({
  translateTextWithAi: translateWithAiMock,
  cancelAiTranslation: cancelAiMock
}))

vi.mock('../text-translation/youdao-dictionary-provider', () => ({
  lookupYoudaoDictionary: lookupDictionaryMock
}))

import {
  registerTextTranslationHandlers,
  TRANSLATION_CANCEL_AI_CHANNEL,
  TRANSLATION_LOOKUP_DICTIONARY_CHANNEL,
  TRANSLATION_TRANSLATE_CHANNEL,
  TRANSLATION_TRANSLATE_WITH_AI_CHANNEL
} from './text-translation-ipc'

type Handler = (event: unknown, args: unknown) => Promise<unknown>

const SETTINGS = {} as GlobalSettings

function registerAndGetHandler(channel: string): Handler {
  registerTextTranslationHandlers({ getSettings: () => SETTINGS })
  const call = handleMock.mock.calls.find(([registered]) => registered === channel)
  if (!call) {
    throw new Error(`${channel} handler was not registered`)
  }
  return call[1] as Handler
}

describe('text translation IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
    removeHandlerMock.mockReset()
    translateTextMock.mockReset()
    translateWithAiMock.mockReset()
    cancelAiMock.mockReset()
    lookupDictionaryMock.mockReset()
    translateTextMock.mockResolvedValue({ ok: true, translatedText: '缓存很冷。' })
    translateWithAiMock.mockResolvedValue({
      ok: true,
      translatedText: '缓存很冷。',
      providerId: 'ai'
    })
  })

  it('clears every stale handler before registering so a reload cannot double-register', () => {
    registerTextTranslationHandlers({ getSettings: () => SETTINGS })
    expect(removeHandlerMock).toHaveBeenCalledWith(TRANSLATION_TRANSLATE_CHANNEL)
    expect(removeHandlerMock).toHaveBeenCalledWith(TRANSLATION_TRANSLATE_WITH_AI_CHANNEL)
    expect(removeHandlerMock).toHaveBeenCalledWith(TRANSLATION_CANCEL_AI_CHANNEL)
  })

  it('forwards a valid request to the service', async () => {
    const handler = registerAndGetHandler(TRANSLATION_TRANSLATE_CHANNEL)
    await expect(handler({}, { text: 'The cache was cold.', preference: 'auto' })).resolves.toEqual(
      {
        ok: true,
        translatedText: '缓存很冷。'
      }
    )
    expect(translateTextMock).toHaveBeenCalledWith(
      { text: 'The cache was cold.', preference: 'auto' },
      expect.objectContaining({ fetchImpl: expect.anything() })
    )
  })

  it('rejects malformed payloads without reaching the network', async () => {
    const handler = registerAndGetHandler(TRANSLATION_TRANSLATE_CHANNEL)
    for (const args of [
      null,
      'text',
      { text: 42, preference: 'auto' },
      { text: 'hi' },
      { text: 'hi', preference: 'fr' }
    ]) {
      await expect(handler({}, args)).resolves.toEqual({ ok: false, kind: 'invalid-input' })
    }
    expect(translateTextMock).not.toHaveBeenCalled()
  })

  it('resolves with a failure instead of rejecting when the service throws', async () => {
    // Why: a rejected invoke reaches the renderer as an unhandled error, not a rendered message.
    translateTextMock.mockRejectedValue(new Error('boom'))
    const handler = registerAndGetHandler(TRANSLATION_TRANSLATE_CHANNEL)
    await expect(handler({}, { text: 'hi', preference: 'en' })).resolves.toEqual({
      ok: false,
      kind: 'provider-error'
    })
  })

  it('forwards an AI request with the live settings getter', async () => {
    const handler = registerAndGetHandler(TRANSLATION_TRANSLATE_WITH_AI_CHANNEL)
    await expect(handler({}, { text: 'dependent', preference: 'auto' })).resolves.toMatchObject({
      providerId: 'ai'
    })
    expect(translateWithAiMock).toHaveBeenCalledWith(
      { text: 'dependent', preference: 'auto' },
      expect.objectContaining({ getSettings: expect.any(Function) })
    )
  })

  it('rejects malformed AI payloads without spawning an agent', async () => {
    const handler = registerAndGetHandler(TRANSLATION_TRANSLATE_WITH_AI_CHANNEL)
    await expect(handler({}, { text: 42, preference: 'auto' })).resolves.toEqual({
      ok: false,
      kind: 'invalid-input'
    })
    expect(translateWithAiMock).not.toHaveBeenCalled()
  })

  it('reports a thrown AI path as ai-unavailable instead of rejecting', async () => {
    translateWithAiMock.mockRejectedValue(new Error('spawn ENOENT'))
    const handler = registerAndGetHandler(TRANSLATION_TRANSLATE_WITH_AI_CHANNEL)
    await expect(handler({}, { text: 'hi', preference: 'auto' })).resolves.toEqual({
      ok: false,
      kind: 'ai-unavailable',
      detail: 'spawn ENOENT'
    })
  })

  it('is safe to cancel with nothing in flight', async () => {
    const handler = registerAndGetHandler(TRANSLATION_CANCEL_AI_CHANNEL)
    await expect(handler({}, undefined)).resolves.toBeUndefined()
    expect(cancelAiMock).toHaveBeenCalledTimes(1)
  })

  describe('translation:lookupDictionary', () => {
    it('returns the provider entries for a valid request', async () => {
      lookupDictionaryMock.mockResolvedValue([{ headword: 'dependent', explain: 'adj. 依赖的' }])
      const handler = registerAndGetHandler(TRANSLATION_LOOKUP_DICTIONARY_CHANNEL)
      await expect(handler({}, { text: 'dependent' })).resolves.toEqual({
        entries: [{ headword: 'dependent', explain: 'adj. 依赖的' }]
      })
    })

    it('returns no entries for a request without a string text', async () => {
      const handler = registerAndGetHandler(TRANSLATION_LOOKUP_DICTIONARY_CHANNEL)
      await expect(handler({}, { text: 42 })).resolves.toEqual({ entries: [] })
      await expect(handler({}, null)).resolves.toEqual({ entries: [] })
    })

    it('resolves rather than rejects when the provider throws', async () => {
      // Why: a rejected invoke surfaces in the renderer as an unhandled crash, not a missed lookup.
      lookupDictionaryMock.mockRejectedValue(new Error('boom'))
      const handler = registerAndGetHandler(TRANSLATION_LOOKUP_DICTIONARY_CHANNEL)
      await expect(handler({}, { text: 'dependent' })).resolves.toEqual({ entries: [] })
    })
  })
})
