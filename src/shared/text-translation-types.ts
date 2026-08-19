/** Chinese and English only; the status bar widget exists for that one pair. */
export type TranslationLanguage = 'zh-CN' | 'en'

/** `'auto'` derives the target from the input text; the others force it. */
export type TranslationDirectionPreference = 'auto' | TranslationLanguage

export const TRANSLATION_INPUT_MAX_LENGTH = 5000

export type TranslationRequest = {
  text: string
  preference: TranslationDirectionPreference
}

export type TranslationProviderId = 'google-gtx' | 'mymemory' | 'ai'

/** One part of speech and its senses; only dictionary words have any. */
export type TranslationDictionaryEntry = {
  /** Raw provider category ('adjective', 'noun'); the renderer localizes it. */
  partOfSpeech: string
  terms: string[]
}

export type TranslationSuccess = {
  ok: true
  translatedText: string
  targetLanguage: TranslationLanguage
  /** What the provider reported, not what we guessed; absent when it does not say. */
  detectedSourceLanguage: string | null
  providerId: TranslationProviderId
  dictionaryEntries: TranslationDictionaryEntry[]
  /** What was actually sent, after case normalization. */
  queriedText: string
  /** Present only for providerId 'ai'. */
  agentLabel?: string
}

export type TranslationFailureKind =
  | 'invalid-input'
  | 'too-long'
  | 'offline'
  | 'rate-limited'
  | 'provider-error'
  | 'timeout'
  | 'ai-unavailable'

export type TranslationFailure = {
  ok: false
  kind: TranslationFailureKind
  /** The agent CLI's own message for 'ai-unavailable'; nothing else sets it. */
  detail?: string
}

export type TranslationResponse = TranslationSuccess | TranslationFailure

export function isTranslationDirectionPreference(
  value: unknown
): value is TranslationDirectionPreference {
  return value === 'auto' || value === 'zh-CN' || value === 'en'
}
