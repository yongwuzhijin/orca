import type { TranslationFailureKind } from '../../../../shared/text-translation-types'
import { translate } from '@/i18n/i18n'

export function describeTranslationFailure(kind: TranslationFailureKind): string {
  switch (kind) {
    case 'invalid-input':
      return translate('statusBar.translate.error.invalidInput', 'Enter some text to translate.')
    case 'too-long':
      return translate('statusBar.translate.error.tooLong', 'Text is too long to translate.')
    case 'offline':
      return translate(
        'statusBar.translate.error.offline',
        'Could not reach the translation service. Check your connection or proxy.'
      )
    case 'rate-limited':
      return translate(
        'statusBar.translate.error.rateLimited',
        'The free translation quota is used up. Try again later.'
      )
    case 'timeout':
      return translate('statusBar.translate.error.timeout', 'The translation request timed out.')
    case 'provider-error':
      return translate(
        'statusBar.translate.error.providerError',
        'The translation service returned an unexpected response.'
      )
    case 'ai-unavailable':
      return translate(
        'statusBar.translate.error.aiUnavailable',
        'The translation API could not complete this translation.'
      )
  }
}
