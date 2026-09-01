import { ipcMain } from 'electron'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  DICTIONARY_LOOKUP_MAX_LENGTH,
  type DictionaryLookupResponse,
  isTranslationDirectionPreference,
  type TranslationRequest,
  type TranslationResponse
} from '../../shared/text-translation-types'
import { cancelAiTranslation, translateTextWithAi } from '../text-translation/ai-translation'
import { translationFetch } from '../text-translation/translation-fetch'
import { translateText } from '../text-translation/translation-service'
import {
  clearTranslateAiApiKey,
  hasTranslateAiApiKey,
  saveTranslateAiApiKey
} from '../text-translation/translate-ai-api-key-store'
import { lookupYoudaoDictionary } from '../text-translation/youdao-dictionary-provider'

export const TRANSLATION_TRANSLATE_CHANNEL = 'translation:translate'
export const TRANSLATION_TRANSLATE_WITH_AI_CHANNEL = 'translation:translateWithAi'
export const TRANSLATION_CANCEL_AI_CHANNEL = 'translation:cancelAi'
export const TRANSLATION_LOOKUP_DICTIONARY_CHANNEL = 'translation:lookupDictionary'
export const TRANSLATION_GET_AI_API_KEY_STATUS_CHANNEL = 'translation:getAiApiKeyStatus'
export const TRANSLATION_SAVE_AI_API_KEY_CHANNEL = 'translation:saveAiApiKey'
export const TRANSLATION_CLEAR_AI_API_KEY_CHANNEL = 'translation:clearAiApiKey'

export type TextTranslationHandlerDeps = {
  getSettings: () => GlobalSettings
}

export function registerTextTranslationHandlers(deps: TextTranslationHandlerDeps): void {
  for (const channel of [
    TRANSLATION_TRANSLATE_CHANNEL,
    TRANSLATION_TRANSLATE_WITH_AI_CHANNEL,
    TRANSLATION_CANCEL_AI_CHANNEL,
    TRANSLATION_LOOKUP_DICTIONARY_CHANNEL,
    TRANSLATION_GET_AI_API_KEY_STATUS_CHANNEL,
    TRANSLATION_SAVE_AI_API_KEY_CHANNEL,
    TRANSLATION_CLEAR_AI_API_KEY_CHANNEL
  ]) {
    ipcMain.removeHandler(channel)
  }

  // Never throws: the popover renders the failure kind, and a rejected invoke would surface as a crash.
  ipcMain.handle(
    TRANSLATION_TRANSLATE_CHANNEL,
    async (_event, args: unknown): Promise<TranslationResponse> => {
      const request = parseTranslationRequest(args)
      if (request === null) {
        return { ok: false, kind: 'invalid-input' }
      }
      try {
        return await translateText(request, { fetchImpl: translationFetch })
      } catch {
        return { ok: false, kind: 'provider-error' }
      }
    }
  )

  ipcMain.handle(
    TRANSLATION_TRANSLATE_WITH_AI_CHANNEL,
    async (_event, args: unknown): Promise<TranslationResponse> => {
      const request = parseTranslationRequest(args)
      if (request === null) {
        return { ok: false, kind: 'invalid-input' }
      }
      try {
        return await translateTextWithAi(request, { getSettings: deps.getSettings })
      } catch (error) {
        return {
          ok: false,
          kind: 'ai-unavailable',
          detail: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  ipcMain.handle(
    TRANSLATION_LOOKUP_DICTIONARY_CHANNEL,
    async (_event, args: unknown): Promise<DictionaryLookupResponse> => {
      // Enforced here too, so a stale renderer cannot reach the third-party host after the opt-out.
      if (deps.getSettings().translateDictionaryLookupEnabled === false) {
        return { entries: [] }
      }
      const text = readDictionaryText(args)
      if (text === null) {
        return { entries: [] }
      }
      try {
        return { entries: await lookupYoudaoDictionary(text, translationFetch) }
      } catch {
        return { entries: [] }
      }
    }
  )

  // Safe with nothing in flight: the lane lookup simply misses.
  ipcMain.handle(TRANSLATION_CANCEL_AI_CHANNEL, async (): Promise<void> => {
    cancelAiTranslation()
  })

  ipcMain.handle(TRANSLATION_GET_AI_API_KEY_STATUS_CHANNEL, async () => ({
    configured: hasTranslateAiApiKey()
  }))

  ipcMain.handle(TRANSLATION_SAVE_AI_API_KEY_CHANNEL, async (_event, apiKey: unknown) => {
    if (typeof apiKey !== 'string') {
      throw new TypeError('API key must be a string')
    }
    saveTranslateAiApiKey(apiKey)
    return { configured: true }
  })

  ipcMain.handle(TRANSLATION_CLEAR_AI_API_KEY_CHANNEL, async () => {
    clearTranslateAiApiKey()
    return { configured: false }
  })
}

function parseTranslationRequest(args: unknown): TranslationRequest | null {
  if (typeof args !== 'object' || args === null) {
    return null
  }
  const { text, preference } = args as { text?: unknown; preference?: unknown }
  if (typeof text !== 'string' || !isTranslationDirectionPreference(preference)) {
    return null
  }
  return { text, preference }
}

// The renderer gate is a UX affordance; this one keeps an untrusted payload out of the third-party URL.
function readDictionaryText(args: unknown): string | null {
  if (typeof args !== 'object' || args === null) {
    return null
  }
  const { text } = args as { text?: unknown }
  if (typeof text !== 'string') {
    return null
  }
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.length > DICTIONARY_LOOKUP_MAX_LENGTH) {
    return null
  }
  return trimmed
}
