import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationDirectionPreference,
  type TranslationFailureKind,
  type TranslationLanguage
} from '../../../../shared/text-translation-types'

export type TranslatePopoverStatus =
  | { phase: 'idle' }
  | { phase: 'translating' }
  | { phase: 'success'; translatedText: string; usedFallbackProvider: boolean }
  | { phase: 'error'; kind: TranslationFailureKind }

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
