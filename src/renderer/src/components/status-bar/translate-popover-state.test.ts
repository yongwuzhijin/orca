import { describe, expect, it } from 'vitest'
import {
  DICTIONARY_LOOKUP_MAX_LENGTH,
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationSuccess
} from '../../../../shared/text-translation-types'
import {
  canSubmitTranslation,
  describeTranslationDirection,
  isTranslationInputTooLong,
  nextTranslationPreference,
  shouldLookUpDictionary,
  toTranslateResult,
  type TranslatePopoverStatus
} from './translate-popover-state'

const IDLE: TranslatePopoverStatus = { phase: 'idle' }

describe('nextTranslationPreference', () => {
  it('cycles auto to each forced direction and back', () => {
    expect(nextTranslationPreference('auto')).toBe('zh-CN')
    expect(nextTranslationPreference('zh-CN')).toBe('en')
    expect(nextTranslationPreference('en')).toBe('auto')
  })
})

describe('canSubmitTranslation', () => {
  it('requires non-whitespace input', () => {
    expect(canSubmitTranslation('hello', IDLE)).toBe(true)
    expect(canSubmitTranslation('', IDLE)).toBe(false)
    expect(canSubmitTranslation('  \n ', IDLE)).toBe(false)
  })

  it('blocks a second submit while one is in flight', () => {
    expect(canSubmitTranslation('hello', { phase: 'translating', usedAi: false })).toBe(false)
    expect(canSubmitTranslation('hello', { phase: 'translating', usedAi: true })).toBe(false)
  })

  it('allows resubmitting after success or failure', () => {
    expect(
      canSubmitTranslation('hello', {
        phase: 'success',
        result: {
          translatedText: '你好',
          dictionaryEntries: [],
          queriedText: 'hello',
          providerId: 'google-gtx'
        }
      })
    ).toBe(true)
    expect(canSubmitTranslation('hello', { phase: 'error', kind: 'offline' })).toBe(true)
  })

  it('blocks input past the cap so the request is never sent', () => {
    const tooLong = 'a'.repeat(TRANSLATION_INPUT_MAX_LENGTH + 1)
    expect(canSubmitTranslation(tooLong, IDLE)).toBe(false)
    expect(isTranslationInputTooLong(tooLong)).toBe(true)
    expect(isTranslationInputTooLong('a'.repeat(TRANSLATION_INPUT_MAX_LENGTH))).toBe(false)
  })
})

describe('toTranslateResult', () => {
  const SUCCESS: TranslationSuccess = {
    ok: true,
    translatedText: '你好',
    targetLanguage: 'zh-CN',
    detectedSourceLanguage: 'en',
    providerId: 'google-gtx',
    dictionaryEntries: [{ partOfSpeech: 'noun', terms: ['问候'] }],
    queriedText: 'hello'
  }

  it('keeps the dictionary the provider reported', () => {
    expect(toTranslateResult(SUCCESS).dictionaryEntries).toEqual([
      { partOfSpeech: 'noun', terms: ['问候'] }
    ])
  })

  it('substitutes an empty dictionary when the payload omits the array', () => {
    const { dictionaryEntries: _dropped, ...skewed } = SUCCESS
    expect(toTranslateResult(skewed as TranslationSuccess).dictionaryEntries).toEqual([])
  })

  it('blanks a queriedText the payload never supplied', () => {
    // Why: a stale main bundle omits the field, and the panel used to print "undefined".
    const stale = {
      ok: true,
      translatedText: '依赖的',
      providerId: 'google-gtx'
    } as unknown as TranslationSuccess
    expect(toTranslateResult(stale).queriedText).toBe('')
  })
})

describe('describeTranslationDirection', () => {
  it('pairs the target with its counterpart and marks auto as unforced', () => {
    expect(describeTranslationDirection('zh-CN', 'auto')).toEqual({
      source: 'en',
      target: 'zh-CN',
      forced: false
    })
    expect(describeTranslationDirection('en', 'auto')).toEqual({
      source: 'zh-CN',
      target: 'en',
      forced: false
    })
  })

  it('marks an explicit preference as forced', () => {
    expect(describeTranslationDirection('en', 'en').forced).toBe(true)
    expect(describeTranslationDirection('zh-CN', 'zh-CN').forced).toBe(true)
  })
})

describe('shouldLookUpDictionary', () => {
  it('looks up a short single word', () => {
    expect(shouldLookUpDictionary('dependent', false, true)).toBe(true)
    expect(shouldLookUpDictionary('依赖', false, true)).toBe(true)
    expect(shouldLookUpDictionary('  dependent  ', false, true)).toBe(true)
  })

  it('skips AI submissions so the panel shows only the agent output', () => {
    expect(shouldLookUpDictionary('dependent', true, true)).toBe(false)
  })

  it('skips input past the word-like length cap', () => {
    expect(shouldLookUpDictionary('a'.repeat(DICTIONARY_LOOKUP_MAX_LENGTH), false, true)).toBe(true)
    expect(shouldLookUpDictionary('a'.repeat(DICTIONARY_LOOKUP_MAX_LENGTH + 1), false, true)).toBe(
      false
    )
  })

  it('skips multiline input, which is prose rather than a lookup', () => {
    expect(shouldLookUpDictionary('one\ntwo', false, true)).toBe(false)
    expect(shouldLookUpDictionary('one\r\ntwo', false, true)).toBe(false)
  })

  it('still looks up a word whose only newline is trailing, since the gate reads trimmed text', () => {
    expect(shouldLookUpDictionary('dependent\n', false, true)).toBe(true)
  })

  it('skips empty input', () => {
    expect(shouldLookUpDictionary('', false, true)).toBe(false)
    expect(shouldLookUpDictionary('   ', false, true)).toBe(false)
  })

  it('skips otherwise-eligible input once the setting is off', () => {
    expect(shouldLookUpDictionary('dependent', false, false)).toBe(false)
  })
})
