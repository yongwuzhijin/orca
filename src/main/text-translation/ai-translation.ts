import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationRequest,
  type TranslationResponse
} from '../../shared/text-translation-types'
import {
  resolveTranslateAiBaseUrl,
  resolveTranslateAiModel
} from '../../shared/translate-ai-defaults'
import { buildTranslationPrompt } from '../../shared/translation-prompt'
import { normalizeTranslationQuery } from '../../shared/translation-query-normalization'
import {
  resolveTranslationSourceLanguage,
  resolveTranslationTargetLanguage
} from '../../shared/translation-target-language'
import {
  requestOpenAiCompatibleTranslation,
  type OpenAiCompatibleTranslationResult
} from './openai-compatible-translation-client'
import { hasTranslateAiApiKey, readTranslateAiApiKey } from './translate-ai-api-key-store'

export type AiTranslationDeps = {
  getSettings: () => GlobalSettings
  hasApiKey?: () => boolean
  readApiKey?: () => string
  requestTranslation?: typeof requestOpenAiCompatibleTranslation
}

let activeController: AbortController | null = null

export async function translateTextWithAi(
  request: TranslationRequest,
  deps: AiTranslationDeps
): Promise<TranslationResponse> {
  const trimmed = request.text.trim()
  if (trimmed === '') {
    return { ok: false, kind: 'invalid-input' }
  }
  if (trimmed.length > TRANSLATION_INPUT_MAX_LENGTH) {
    return { ok: false, kind: 'too-long' }
  }

  const hasKey = (deps.hasApiKey ?? hasTranslateAiApiKey)()
  if (!hasKey) {
    return {
      ok: false,
      kind: 'ai-unavailable',
      detail: 'Configure a translate AI API key in Settings.'
    }
  }

  const text = normalizeTranslationQuery(trimmed)
  const target = resolveTranslationTargetLanguage(text, request.preference)
  const settings = deps.getSettings()
  const baseUrl = resolveTranslateAiBaseUrl(settings.translateAiBaseUrl)
  const model = resolveTranslateAiModel(settings.translateAiModel)
  const prompt = buildTranslationPrompt(text, target)

  activeController?.abort()
  const controller = new AbortController()
  activeController = controller

  const result = await (deps.requestTranslation ?? requestOpenAiCompatibleTranslation)({
    baseUrl,
    apiKey: (deps.readApiKey ?? readTranslateAiApiKey)(),
    model,
    prompt,
    signal: controller.signal
  })

  if (activeController === controller) {
    activeController = null
  }

  return mapTranslationResult(result, { text, target, model })
}

export function cancelAiTranslation(): void {
  activeController?.abort()
  activeController = null
}

function mapTranslationResult(
  result: OpenAiCompatibleTranslationResult,
  context: {
    text: string
    target: ReturnType<typeof resolveTranslationTargetLanguage>
    model: string
  }
): TranslationResponse {
  if (!result.ok) {
    switch (result.kind) {
      case 'timeout':
        return { ok: false, kind: 'timeout' }
      case 'offline':
        return { ok: false, kind: 'offline' }
      case 'aborted':
        return { ok: false, kind: 'ai-unavailable' }
      default:
        return { ok: false, kind: 'ai-unavailable', detail: result.detail }
    }
  }

  const translatedText = result.text.trim()
  if (translatedText === '') {
    return { ok: false, kind: 'ai-unavailable', detail: `${context.model} returned nothing.` }
  }

  return {
    ok: true,
    translatedText,
    targetLanguage: context.target,
    detectedSourceLanguage: resolveTranslationSourceLanguage(context.target),
    providerId: 'ai',
    dictionaryEntries: [],
    queriedText: context.text,
    agentLabel: context.model
  }
}
