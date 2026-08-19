import { describe, expect, it } from 'vitest'
import { normalizeTranslationQuery } from './translation-query-normalization'

describe('normalizeTranslationQuery', () => {
  it('lowercases a shouted single word so it hits the dictionary', () => {
    expect(normalizeTranslationQuery('DEPENDENT')).toBe('dependent')
  })

  it('lowercases acronyms, which gtx answers identically either way', () => {
    expect(normalizeTranslationQuery('USA')).toBe('usa')
  })

  it('leaves a word alone once it contains any lowercase letter', () => {
    expect(normalizeTranslationQuery('iOS')).toBe('iOS')
    expect(normalizeTranslationQuery('Dependent')).toBe('Dependent')
  })

  it('leaves multi-word input alone, where casing carries meaning', () => {
    expect(normalizeTranslationQuery('THE CACHE WAS COLD')).toBe('THE CACHE WAS COLD')
  })

  it('leaves a single letter alone, since it is more likely a symbol than a word', () => {
    expect(normalizeTranslationQuery('A')).toBe('A')
    expect(normalizeTranslationQuery('I')).toBe('I')
  })

  it('leaves CJK untouched', () => {
    expect(normalizeTranslationQuery('依赖')).toBe('依赖')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeTranslationQuery('  DEPENDENT \n')).toBe('dependent')
  })

  it('leaves punctuation-only input alone', () => {
    expect(normalizeTranslationQuery('---')).toBe('---')
  })
})
