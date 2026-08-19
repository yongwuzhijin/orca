import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleMock, removeHandlerMock, translateTextMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  removeHandlerMock: vi.fn(),
  translateTextMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: removeHandlerMock }
}))

vi.mock('../text-translation/translation-fetch', () => ({ translationFetch: vi.fn() }))

vi.mock('../text-translation/translation-service', () => ({ translateText: translateTextMock }))

import {
  registerTextTranslationHandlers,
  TRANSLATION_TRANSLATE_CHANNEL
} from './text-translation-ipc'

type Handler = (event: unknown, args: unknown) => Promise<unknown>

function registerAndGetHandler(): Handler {
  registerTextTranslationHandlers()
  const call = handleMock.mock.calls.find(([channel]) => channel === TRANSLATION_TRANSLATE_CHANNEL)
  if (!call) {
    throw new Error('translate handler was not registered')
  }
  return call[1] as Handler
}

describe('text translation IPC', () => {
  beforeEach(() => {
    handleMock.mockReset()
    removeHandlerMock.mockReset()
    translateTextMock.mockReset()
    translateTextMock.mockResolvedValue({ ok: true, translatedText: '缓存很冷。' })
  })

  it('clears the stale handler before registering so a reload cannot double-register', () => {
    registerTextTranslationHandlers()
    expect(removeHandlerMock).toHaveBeenCalledWith(TRANSLATION_TRANSLATE_CHANNEL)
  })

  it('forwards a valid request to the service', async () => {
    const handler = registerAndGetHandler()
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
    const handler = registerAndGetHandler()
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
    const handler = registerAndGetHandler()
    await expect(handler({}, { text: 'hi', preference: 'en' })).resolves.toEqual({
      ok: false,
      kind: 'provider-error'
    })
  })
})
