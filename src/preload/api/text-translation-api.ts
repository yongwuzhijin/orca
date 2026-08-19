import type { TranslationRequest, TranslationResponse } from '../../shared/text-translation-types'

export type TextTranslationApi = {
  translate: (request: TranslationRequest) => Promise<TranslationResponse>
  translateWithAi: (request: TranslationRequest) => Promise<TranslationResponse>
  cancelAi: () => Promise<void>
}
