import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getTranslateDictionaryEntry = createLocalizedCatalog(() => ({
  title: translate(
    'auto.components.settings.appearance.search.translateDictionaryTitle',
    'Dictionary definitions'
  ),
  description: translate(
    'auto.components.settings.appearance.search.translateDictionaryDescription',
    'Let the translate popover request word definitions from dict.youdao.com.'
  ),
  keywords: [
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.translateDictionaryKeywordDictionary',
      'dictionary',
      { aliases: ['youdao'] }
    ),
    ...translateSearchKeyword(
      'auto.components.settings.appearance.search.translateDictionaryKeywordTranslate',
      'translate'
    ),
    ...translateSearchKeyword('auto.components.settings.appearance.search.896eb53fd4', 'status bar')
  ]
}))
