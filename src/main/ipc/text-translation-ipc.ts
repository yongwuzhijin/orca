import { ipcMain } from 'electron'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  isTranslationDirectionPreference,
  type TranslationRequest,
  type TranslationResponse
} from '../../shared/text-translation-types'
import { cancelAiTranslation, translateTextWithAi } from '../text-translation/ai-translation'
import { translationFetch } from '../text-translation/translation-fetch'
import { translateText } from '../text-translation/translation-service'

export const TRANSLATION_TRANSLATE_CHANNEL = 'translation:translate'
export const TRANSLATION_TRANSLATE_WITH_AI_CHANNEL = 'translation:translateWithAi'
export const TRANSLATION_CANCEL_AI_CHANNEL = 'translation:cancelAi'

export type TextTranslationHandlerDeps = {
  getSettings: () => GlobalSettings
}

export function registerTextTranslationHandlers(deps: TextTranslationHandlerDeps): void {
  for (const channel of [
    TRANSLATION_TRANSLATE_CHANNEL,
    TRANSLATION_TRANSLATE_WITH_AI_CHANNEL,
    TRANSLATION_CANCEL_AI_CHANNEL
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

  // Safe with nothing in flight: the lane lookup simply misses.
  ipcMain.handle(TRANSLATION_CANCEL_AI_CHANNEL, async (): Promise<void> => {
    cancelAiTranslation()
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
