import { ipcMain } from 'electron'
import {
  isTranslationDirectionPreference,
  type TranslationResponse
} from '../../shared/text-translation-types'
import { translationFetch } from '../text-translation/translation-fetch'
import { translateText } from '../text-translation/translation-service'

export const TRANSLATION_TRANSLATE_CHANNEL = 'translation:translate'

export function registerTextTranslationHandlers(): void {
  ipcMain.removeHandler(TRANSLATION_TRANSLATE_CHANNEL)

  // Never throws: the popover renders the failure kind, and a rejected invoke would surface as a crash.
  ipcMain.handle(
    TRANSLATION_TRANSLATE_CHANNEL,
    async (_event, args: unknown): Promise<TranslationResponse> => {
      if (typeof args !== 'object' || args === null) {
        return { ok: false, kind: 'invalid-input' }
      }
      const { text, preference } = args as { text?: unknown; preference?: unknown }
      if (typeof text !== 'string' || !isTranslationDirectionPreference(preference)) {
        return { ok: false, kind: 'invalid-input' }
      }
      try {
        return await translateText({ text, preference }, { fetchImpl: translationFetch })
      } catch {
        return { ok: false, kind: 'provider-error' }
      }
    }
  )
}
