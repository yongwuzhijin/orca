import { describe, expect, it } from 'vitest'
import { describeTranslationPartOfSpeech } from './translation-part-of-speech'

describe('describeTranslationPartOfSpeech', () => {
  it('abbreviates every category gtx is known to return', () => {
    expect(describeTranslationPartOfSpeech('noun')).toBe('n.')
    expect(describeTranslationPartOfSpeech('verb')).toBe('v.')
    expect(describeTranslationPartOfSpeech('adjective')).toBe('adj.')
    expect(describeTranslationPartOfSpeech('adverb')).toBe('adv.')
    expect(describeTranslationPartOfSpeech('preposition')).toBe('prep.')
    expect(describeTranslationPartOfSpeech('conjunction')).toBe('conj.')
    expect(describeTranslationPartOfSpeech('pronoun')).toBe('pron.')
    expect(describeTranslationPartOfSpeech('interjection')).toBe('interj.')
    expect(describeTranslationPartOfSpeech('abbreviation')).toBe('abbr.')
    expect(describeTranslationPartOfSpeech('numeral')).toBe('num.')
  })

  it('matches regardless of the casing and padding gtx sends', () => {
    expect(describeTranslationPartOfSpeech(' Adjective ')).toBe('adj.')
  })

  it('shows an unmapped category verbatim instead of hiding its senses', () => {
    expect(describeTranslationPartOfSpeech('particle')).toBe('particle')
    expect(describeTranslationPartOfSpeech('')).toBe('')
  })
})
