/** Chinese and English only; the status bar widget exists for that one pair. */
export type TranslationLanguage = 'zh-CN' | 'en'

/** `'auto'` derives the target from the input text; the others force it. */
export type TranslationDirectionPreference = 'auto' | TranslationLanguage

export const TRANSLATION_INPUT_MAX_LENGTH = 5000

export type TranslationRequest = {
  text: string
  preference: TranslationDirectionPreference
}

export type TranslationProviderId = 'google-gtx' | 'mymemory'

export type TranslationSuccess = {
  ok: true
  translatedText: string
  targetLanguage: TranslationLanguage
  /** What the provider reported, not what we guessed; absent when it does not say. */
  detectedSourceLanguage: string | null
  providerId: TranslationProviderId
}

export type TranslationFailureKind =
  | 'invalid-input'
  | 'too-long'
  | 'offline'
  | 'rate-limited'
  | 'provider-error'
  | 'timeout'

export type TranslationFailure = {
  ok: false
  kind: TranslationFailureKind
}

export type TranslationResponse = TranslationSuccess | TranslationFailure

export function isTranslationDirectionPreference(
  value: unknown
): value is TranslationDirectionPreference {
  return value === 'auto' || value === 'zh-CN' || value === 'en'
}
