import { parseGoogleGtxResponse } from './google-gtx-response'
import {
  classifyTranslationFetchError,
  classifyTranslationHttpStatus,
  TRANSLATION_REQUEST_TIMEOUT_MS,
  type TranslationProvider
} from './translation-provider'

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

export const googleGtxProvider: TranslationProvider = {
  id: 'google-gtx',
  translate: async ({ text, target }, fetchImpl) => {
    // sl=auto so the provider reports the source instead of trusting our CJK guess.
    // dt=bd adds the dictionary block; it costs nothing and is null for sentences.
    const url = `${ENDPOINT}?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&dt=bd&q=${encodeURIComponent(text)}`
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
    const parsed = parseGoogleGtxResponse(raw)
    return parsed === null ? { ok: false, kind: 'provider-error' } : { ok: true, ...parsed }
  }
}
