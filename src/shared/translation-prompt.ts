import type { TranslationLanguage } from './text-translation-types'

const LANGUAGE_NAMES: Record<TranslationLanguage, string> = {
  'zh-CN': 'Simplified Chinese',
  en: 'English'
}

/**
 * Free-form on purpose: the popover renders whatever comes back as pre-wrapped
 * text, so a model that ignores the requested shape still produces something
 * readable. Asking for senses only on single words keeps sentences from coming
 * back as dictionary entries.
 */
export function buildTranslationPrompt(text: string, target: TranslationLanguage): string {
  const targetName = LANGUAGE_NAMES[target]
  const shape = isSingleWord(text)
    ? `It is a single word. List its senses grouped by part of speech, one line per part of speech, in the form "adj. …；…". Add a short usage note only if the senses would otherwise be ambiguous.`
    : `Give one natural ${targetName} translation. Preserve the tone and any technical terms. Do not explain it.`
  return [
    `Translate the following text into ${targetName}.`,
    shape,
    'Reply with the translation only — no preamble, no restating the input, no markdown fences.',
    '',
    'Text:',
    text
  ].join('\n')
}

function isSingleWord(text: string): boolean {
  return !/\s/.test(text.trim())
}
