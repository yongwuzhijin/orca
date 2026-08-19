import { parseMyMemoryResponse } from './mymemory-response'
import {
  classifyTranslationFetchError,
  classifyTranslationHttpStatus,
  TRANSLATION_REQUEST_TIMEOUT_MS,
  type TranslationProvider
} from './translation-provider'

const ENDPOINT = 'https://api.mymemory.translated.net/get'

export const myMemoryProvider: TranslationProvider = {
  id: 'mymemory',
  // No auto-detect here, so the pair comes from the resolved direction.
  translate: async ({ text, target, source }, fetchImpl) => {
    const langpair = encodeURIComponent(`${source}|${target}`)
    const url = `${ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${langpair}`
    let body: string
    let status: number
    let ok: boolean
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(TRANSLATION_REQUEST_TIMEOUT_MS)
      })
      ok = response.ok
      status = response.status
      body = await response.text()
    } catch (error) {
      return { ok: false, kind: classifyTranslationFetchError(error) }
    }
    if (!ok) {
      return { ok: false, kind: classifyTranslationHttpStatus(status) }
    }
    let raw: unknown
    try {
      raw = JSON.parse(body)
    } catch {
      return { ok: false, kind: 'provider-error' }
    }
    const parsed = parseMyMemoryResponse(raw)
    if (!parsed.ok) {
      return { ok: false, kind: parsed.kind }
    }
    return { ok: true, translatedText: parsed.translatedText, detectedSourceLanguage: source }
  }
}
