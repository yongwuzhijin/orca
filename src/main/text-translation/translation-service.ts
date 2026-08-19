import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationRequest,
  type TranslationResponse
} from '../../shared/text-translation-types'
import { googleGtxProvider } from './google-gtx-provider'
import { myMemoryProvider } from './mymemory-provider'
import { normalizeTranslationQuery } from '../../shared/translation-query-normalization'
import {
  resolveTranslationSourceLanguage,
  resolveTranslationTargetLanguage
} from '../../shared/translation-target-language'
import type { TranslationFetch, TranslationProvider } from './translation-provider'

const DEFAULT_PROVIDERS: TranslationProvider[] = [googleGtxProvider, myMemoryProvider]

export async function translateText(
  request: TranslationRequest,
  deps: { fetchImpl: TranslationFetch; providers?: TranslationProvider[] }
): Promise<TranslationResponse> {
  const trimmed = request.text.trim()
  if (trimmed === '') {
    return { ok: false, kind: 'invalid-input' }
  }
  if (trimmed.length > TRANSLATION_INPUT_MAX_LENGTH) {
    return { ok: false, kind: 'too-long' }
  }
  const text = normalizeTranslationQuery(trimmed)
  const target = resolveTranslationTargetLanguage(text, request.preference)
  const source = resolveTranslationSourceLanguage(target)
  const providers = deps.providers ?? DEFAULT_PROVIDERS

  let primaryFailure: TranslationResponse = { ok: false, kind: 'provider-error' }
  for (const [index, provider] of providers.entries()) {
    const result = await provider
      .translate({ text, target, source }, deps.fetchImpl)
      .catch(() => ({ ok: false, kind: 'provider-error' }) as const)
    if (result.ok) {
      return {
        ok: true,
        translatedText: result.translatedText,
        targetLanguage: target,
        detectedSourceLanguage: result.detectedSourceLanguage,
        providerId: provider.id,
        dictionaryEntries: result.dictionaryEntries,
        queriedText: text
      }
    }
    // Report the primary's reason: the fallback's error is noise to the user.
    if (index === 0) {
      primaryFailure = { ok: false, kind: result.kind }
    }
  }
  return primaryFailure
}
