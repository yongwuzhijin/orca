import { translate } from '@/i18n/i18n'

/**
 * gtx reports the raw English category ('adjective'). An unmapped one falls back
 * to the provider's own string rather than being hidden, so a new gtx category
 * still shows its senses.
 */
export function describeTranslationPartOfSpeech(partOfSpeech: string): string {
  switch (partOfSpeech.trim().toLowerCase()) {
    case 'noun':
      return translate('statusBar.translate.partOfSpeech.noun', 'n.')
    case 'verb':
      return translate('statusBar.translate.partOfSpeech.verb', 'v.')
    case 'adjective':
      return translate('statusBar.translate.partOfSpeech.adjective', 'adj.')
    case 'adverb':
      return translate('statusBar.translate.partOfSpeech.adverb', 'adv.')
    case 'preposition':
      return translate('statusBar.translate.partOfSpeech.preposition', 'prep.')
    case 'conjunction':
      return translate('statusBar.translate.partOfSpeech.conjunction', 'conj.')
    case 'pronoun':
      return translate('statusBar.translate.partOfSpeech.pronoun', 'pron.')
    case 'interjection':
      return translate('statusBar.translate.partOfSpeech.interjection', 'interj.')
    case 'abbreviation':
      return translate('statusBar.translate.partOfSpeech.abbreviation', 'abbr.')
    case 'numeral':
      return translate('statusBar.translate.partOfSpeech.numeral', 'num.')
    default:
      return partOfSpeech
  }
}
