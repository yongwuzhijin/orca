import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getBrowserQuickLinksPaneSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate(
      'auto.components.settings.browser.quick.links.search.title',
      'Browser Quick Links'
    ),
    description: translate(
      'auto.components.settings.browser.quick.links.search.description',
      'Global browser shortcuts shown in the Bookmarks sidebar, organized into folders.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwBookmark',
        'bookmark'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwBookmarks',
        'bookmarks'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwQuick',
        'quick'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwLink',
        'link'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwLinks',
        'links'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwShortcut',
        'shortcut'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwBrowser',
        'browser'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwFolder',
        'folder'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.browser.quick.links.search.kwFavorites',
        'favorites'
      )
    ]
  }
])
