import type {
  TranslationFailureKind,
  TranslationLanguage,
  TranslationProviderId
} from '../../shared/text-translation-types'

export const TRANSLATION_REQUEST_TIMEOUT_MS = 5000

export type TranslationFetchResponse = {
  ok: boolean
  status: number
  text: () => Promise<string>
}

export type TranslationFetch = (
  url: string,
  init: { signal: AbortSignal }
) => Promise<TranslationFetchResponse>

export type TranslationProviderInput = {
  text: string
  target: TranslationLanguage
  source: TranslationLanguage
}

export type TranslationProviderResult =
  | { ok: true; translatedText: string; detectedSourceLanguage: string | null }
  | { ok: false; kind: TranslationFailureKind }

export type TranslationProvider = {
  id: TranslationProviderId
  translate: (
    input: TranslationProviderInput,
    fetchImpl: TranslationFetch
  ) => Promise<TranslationProviderResult>
}

export function classifyTranslationFetchError(error: unknown): TranslationFailureKind {
  const name = error instanceof Error ? error.name : ''
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'offline'
}

export function classifyTranslationHttpStatus(status: number): TranslationFailureKind {
  return status === 429 ? 'rate-limited' : 'provider-error'
}
