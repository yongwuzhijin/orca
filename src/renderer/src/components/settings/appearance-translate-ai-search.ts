import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

/** Stable Settings deep-link / scroll target for AI translation settings. */
export const TRANSLATE_AI_SETTING_ID = 'translate-ai'

export const getTranslateAiEntry = createLocalizedCatalog(() => ({
  title: translate('auto.components.settings.appearance.search.translateAiTitle', 'AI translation'),
  description: translate(
    'auto.components.settings.appearance.search.translateAiDescription',
    'Configure the OpenAI-compatible API used when AI translation is selected.'
  ),
  keywords: [
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.translateAiKeywordAi',
      'ai'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.translateAiKeywordTranslate',
      'translate',
      { aliases: ['translation'] }
    ),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.translateAiKeywordOpenai',
      'openai'
    ),
    ...translateSearchKeyword('auto.components.settings.appearance.search.896eb53fd4', 'status bar')
  ]
}))
