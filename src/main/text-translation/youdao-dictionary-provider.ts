import {
  DICTIONARY_LOOKUP_MAX_ENTRIES,
  type DictionaryHeadwordEntry
} from '../../shared/text-translation-types'
import { TRANSLATION_REQUEST_TIMEOUT_MS, type TranslationFetch } from './translation-provider'
import { parseYoudaoDictionaryResponse } from './youdao-dictionary-response'

const ENDPOINT = 'https://dict.youdao.com/suggest'

/** Never rejects: the dictionary is supplementary, so every failure is simply "no entries". */
export async function lookupYoudaoDictionary(
  text: string,
  fetchImpl: TranslationFetch
): Promise<DictionaryHeadwordEntry[]> {
  // le=en serves both directions, so the caller never resolves a language pair.
  const url = `${ENDPOINT}?num=${DICTIONARY_LOOKUP_MAX_ENTRIES}&ver=3.0&doctype=json&cache=false&le=en&q=${encodeURIComponent(text)}`
  let body: string
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(TRANSLATION_REQUEST_TIMEOUT_MS)
    })
    if (!response.ok) {
      return []
    }
    body = await response.text()
  } catch {
    return []
  }
  try {
    return parseYoudaoDictionaryResponse(JSON.parse(body))
  } catch {
    return []
  }
}
