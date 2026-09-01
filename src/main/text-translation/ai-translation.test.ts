import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  DEFAULT_TRANSLATE_AI_BASE_URL,
  DEFAULT_TRANSLATE_AI_MODEL
} from '../../shared/translate-ai-defaults'
import { cancelAiTranslation, translateTextWithAi } from './ai-translation'

const requestTranslationMock = vi.fn()
const hasApiKeyMock = vi.fn()
const readApiKeyMock = vi.fn()

const SETTINGS = {} as GlobalSettings
const deps = {
  getSettings: () => SETTINGS,
  hasApiKey: hasApiKeyMock,
  readApiKey: readApiKeyMock,
  requestTranslation: requestTranslationMock
}

describe('translateTextWithAi', () => {
  beforeEach(() => {
    requestTranslationMock.mockReset()
    hasApiKeyMock.mockReset()
    readApiKeyMock.mockReset()
    hasApiKeyMock.mockReturnValue(true)
    readApiKeyMock.mockReturnValue('test-key')
    requestTranslationMock.mockResolvedValue({ ok: true, text: 'adj. 依赖的\nn. 依赖他人者\n' })
  })

  it('returns the model output as an ai-provider success', async () => {
    await expect(
      translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    ).resolves.toEqual({
      ok: true,
      translatedText: 'adj. 依赖的\nn. 依赖他人者',
      targetLanguage: 'zh-CN',
      detectedSourceLanguage: 'en',
      providerId: 'ai',
      dictionaryEntries: [],
      queriedText: 'dependent',
      agentLabel: DEFAULT_TRANSLATE_AI_MODEL
    })
  })

  it('calls requestTranslation with resolved baseUrl, model, prompt, and signal', async () => {
    await translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    expect(requestTranslationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: DEFAULT_TRANSLATE_AI_BASE_URL,
        apiKey: 'test-key',
        model: DEFAULT_TRANSLATE_AI_MODEL,
        prompt: expect.stringContaining('Simplified Chinese'),
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('asks for senses on a single word and a natural translation on a sentence', async () => {
    await translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    const wordPrompt = requestTranslationMock.mock.calls[0][0].prompt as string
    expect(wordPrompt).toContain('single word')
    expect(wordPrompt).toContain('dependent')

    requestTranslationMock.mockClear()
    await translateTextWithAi({ text: 'The cache was cold.', preference: 'auto' }, deps)
    const sentencePrompt = requestTranslationMock.mock.calls[0][0].prompt as string
    expect(sentencePrompt).not.toContain('single word')
    expect(sentencePrompt).toContain('one natural Simplified Chinese translation')
  })

  it('honors custom baseUrl and model from settings', async () => {
    const customSettings = {
      translateAiBaseUrl: ' https://example.com/v1 ',
      translateAiModel: ' custom-model '
    } as GlobalSettings
    await translateTextWithAi(
      { text: 'dependent', preference: 'auto' },
      { ...deps, getSettings: () => customSettings }
    )
    expect(requestTranslationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://example.com/v1',
        model: 'custom-model'
      })
    )
  })

  it('lowercases a shouted word the same way the free path does', async () => {
    await expect(
      translateTextWithAi({ text: 'DEPENDENT', preference: 'auto' }, deps)
    ).resolves.toMatchObject({ ok: true, queriedText: 'dependent' })
  })

  it('does not call request when no API key is configured', async () => {
    hasApiKeyMock.mockReturnValue(false)
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'ai-unavailable',
      detail: 'Configure a translate AI API key in Settings.'
    })
    expect(requestTranslationMock).not.toHaveBeenCalled()
  })

  it('maps unauthorized and provider-error to ai-unavailable', async () => {
    requestTranslationMock.mockResolvedValueOnce({
      ok: false,
      kind: 'unauthorized',
      detail: 'bad key'
    })
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'ai-unavailable',
      detail: 'bad key'
    })

    requestTranslationMock.mockResolvedValueOnce({
      ok: false,
      kind: 'provider-error',
      detail: '503'
    })
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'ai-unavailable',
      detail: '503'
    })
  })

  it('maps timeout and offline to their response kinds', async () => {
    requestTranslationMock.mockResolvedValueOnce({ ok: false, kind: 'timeout' })
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'timeout'
    })

    requestTranslationMock.mockResolvedValueOnce({ ok: false, kind: 'offline' })
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'offline'
    })
  })

  it('treats aborted requests as ai-unavailable', async () => {
    requestTranslationMock.mockResolvedValueOnce({ ok: false, kind: 'aborted' })
    await expect(
      translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)
    ).resolves.toMatchObject({ ok: false, kind: 'ai-unavailable' })
  })

  it('treats empty model output as unavailable instead of an empty translation', async () => {
    requestTranslationMock.mockResolvedValue({ ok: true, text: '  \n ' })
    await expect(
      translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)
    ).resolves.toMatchObject({ ok: false, kind: 'ai-unavailable' })
  })

  it('rejects blank and oversized input before calling the provider', async () => {
    await expect(translateTextWithAi({ text: '  ', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'invalid-input'
    })
    await expect(
      translateTextWithAi({ text: 'a'.repeat(5001), preference: 'auto' }, deps)
    ).resolves.toEqual({ ok: false, kind: 'too-long' })
    expect(requestTranslationMock).not.toHaveBeenCalled()
  })
})

describe('cancelAiTranslation', () => {
  it('aborts the in-flight request signal', async () => {
    let capturedSignal: AbortSignal | undefined
    requestTranslationMock.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          capturedSignal = signal
          signal?.addEventListener('abort', () => resolve({ ok: false, kind: 'aborted' }), {
            once: true
          })
        })
    )

    const pending = translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    await Promise.resolve()
    cancelAiTranslation()
    await expect(pending).resolves.toMatchObject({ ok: false, kind: 'ai-unavailable' })
    expect(capturedSignal?.aborted).toBe(true)
  })
})
