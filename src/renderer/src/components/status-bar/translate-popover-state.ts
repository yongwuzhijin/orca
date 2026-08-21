import {
  DICTIONARY_LOOKUP_MAX_LENGTH,
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationDictionaryEntry,
  type TranslationDirectionPreference,
  type TranslationFailureKind,
  type TranslationLanguage,
  type TranslationProviderId,
  type TranslationSuccess
} from '../../../../shared/text-translation-types'

export type TranslateResult = {
  translatedText: string
  dictionaryEntries: TranslationDictionaryEntry[]
  /** Differs from the typed text only when case normalization kicked in. */
  queriedText: string
  providerId: TranslationProviderId
  agentLabel?: string
}

// Why: main and renderer version-skew independently, so a stale main bundle omits
// dictionaryEntries entirely — trusting it took the whole status bar down.
export function toTranslateResult(response: TranslationSuccess): TranslateResult {
  return {
    translatedText: response.translatedText,
    dictionaryEntries: Array.isArray(response.dictionaryEntries) ? response.dictionaryEntries : [],
    queriedText: typeof response.queriedText === 'string' ? response.queriedText : '',
    providerId: response.providerId,
    agentLabel: response.agentLabel
  }
}

export type TranslatePopoverStatus =
  | { phase: 'idle' }
  | { phase: 'translating'; usedAi: boolean }
  | { phase: 'success'; result: TranslateResult }
  | { phase: 'error'; kind: TranslationFailureKind; detail?: string }

const PREFERENCE_CYCLE: TranslationDirectionPreference[] = ['auto', 'zh-CN', 'en']

export function nextTranslationPreference(
  current: TranslationDirectionPreference
): TranslationDirectionPreference {
  const index = PREFERENCE_CYCLE.indexOf(current)
  return PREFERENCE_CYCLE[(index + 1) % PREFERENCE_CYCLE.length]
}

export function canSubmitTranslation(text: string, status: TranslatePopoverStatus): boolean {
  const trimmed = text.trim()
  return (
    status.phase !== 'translating' &&
    trimmed.length > 0 &&
    trimmed.length <= TRANSLATION_INPUT_MAX_LENGTH
  )
}

/** True once typing has exceeded the cap, so the count can turn red before submitting. */
export function isTranslationInputTooLong(text: string): boolean {
  return text.trim().length > TRANSLATION_INPUT_MAX_LENGTH
}

export type TranslationDirectionLabel = {
  source: TranslationLanguage
  target: TranslationLanguage
  /** Forced directions get a distinct chip treatment so 'auto' is never mistaken for a lock. */
  forced: boolean
}

export function describeTranslationDirection(
  target: TranslationLanguage,
  preference: TranslationDirectionPreference
): TranslationDirectionLabel {
  return {
    source: target === 'en' ? 'zh-CN' : 'en',
    target,
    forced: preference !== 'auto'
  }
}

/** Youdao only helps for word-like input, and AI mode deliberately shows the agent alone. */
export function shouldLookUpDictionary(
  text: string,
  withAi: boolean,
  dictionaryEnabled: boolean
): boolean {
  if (withAi || !dictionaryEnabled) {
    return false
  }
  const trimmed = text.trim()
  return (
    trimmed.length > 0 && trimmed.length <= DICTIONARY_LOOKUP_MAX_LENGTH && !/[\r\n]/.test(trimmed)
  )
}
