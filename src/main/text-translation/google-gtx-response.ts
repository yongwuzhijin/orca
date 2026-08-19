import type { TranslationDictionaryEntry } from '../../shared/text-translation-types'

export type GoogleGtxTranslation = {
  translatedText: string
  detectedSourceLanguage: string | null
  dictionaryEntries: TranslationDictionaryEntry[]
}

// gtx answers with untyped nested arrays: [segments, dictionary, detectedSource, ...].
export function parseGoogleGtxResponse(raw: unknown): GoogleGtxTranslation | null {
  if (!Array.isArray(raw)) {
    return null
  }
  const segments = raw[0]
  if (!Array.isArray(segments)) {
    return null
  }
  let translatedText = ''
  for (const segment of segments) {
    // Long input is split across segments; skipping the join truncates to sentence one.
    if (Array.isArray(segment) && typeof segment[0] === 'string') {
      translatedText += segment[0]
    }
  }
  if (translatedText.length === 0) {
    return null
  }
  const detected = raw[2]
  return {
    translatedText,
    detectedSourceLanguage: typeof detected === 'string' ? detected : null,
    dictionaryEntries: parseDictionaryBlock(raw[1])
  }
}

// raw[1] is null for sentences, so its presence is the word/sentence discriminator.
// Each entry: [partOfSpeech, [terms…], [[term, [synonyms…], …]…], baseForm, order].
function parseDictionaryBlock(block: unknown): TranslationDictionaryEntry[] {
  if (!Array.isArray(block)) {
    return []
  }
  const entries: TranslationDictionaryEntry[] = []
  for (const entry of block) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
      continue
    }
    const terms = Array.isArray(entry[1]) ? entry[1].filter(isNonEmptyString) : []
    if (terms.length === 0) {
      continue
    }
    entries.push({ partOfSpeech: entry[0], terms })
  }
  return entries
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
