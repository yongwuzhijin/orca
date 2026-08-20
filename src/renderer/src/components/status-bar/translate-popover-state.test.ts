import { describe, expect, it } from 'vitest'
import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationSuccess
} from '../../../../shared/text-translation-types'
import {
  canSubmitTranslation,
  describeTranslationDirection,
  isTranslationInputTooLong,
  nextTranslationPreference,
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
