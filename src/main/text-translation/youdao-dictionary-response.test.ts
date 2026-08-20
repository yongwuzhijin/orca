import { describe, expect, it } from 'vitest'
import { DICTIONARY_LOOKUP_MAX_ENTRIES } from '../../shared/text-translation-types'
import { parseYoudaoDictionaryResponse } from './youdao-dictionary-response'

// Recorded from dict.youdao.com/suggest?q=dependent so a shape change fails here, not in the UI.
const ENGLISH_SUCCESS = {
  result: { msg: 'success', code: 200 },
  data: {
    entries: [
      { explain: 'adj. 依赖的，依靠的；取决于；有瘾的; n. 受供养者', entry: 'dependent' },
      { explain: 'n. 受供养者（dependent 的复数）', entry: 'dependents' },
      {
        explain: '依赖变量：在一个函数中，其值由一个或多个其他变量的值决定的数学变量。',
        entry: 'dependent variable'
      }
    ],
    query: 'dependent',
    language: 'en',
    type: 'dict'
  }
}

// Recorded from the same endpoint with q=依赖 — le=en serves both directions.
const CHINESE_SUCCESS = {
  result: { msg: 'success', code: 200 },
  data: {
    entries: [
      { explain: 'rely on; depend on', entry: '依赖' },
      { explain: 'dependency; dependence', entry: '依赖性' }
    ],
    query: '依赖',
    language: 'en',
    type: 'dict'
  }
}

describe('parseYoudaoDictionaryResponse', () => {
  it('maps every entry to a headword and its gloss', () => {
    expect(parseYoudaoDictionaryResponse(ENGLISH_SUCCESS)).toEqual([
      { headword: 'dependent', explain: 'adj. 依赖的，依靠的；取决于；有瘾的; n. 受供养者' },
      { headword: 'dependents', explain: 'n. 受供养者（dependent 的复数）' },
      {
        headword: 'dependent variable',
        explain: '依赖变量：在一个函数中，其值由一个或多个其他变量的值决定的数学变量。'
      }
    ])
  })

  it('reads Chinese queries the same way', () => {
    expect(parseYoudaoDictionaryResponse(CHINESE_SUCCESS)).toEqual([
      { headword: '依赖', explain: 'rely on; depend on' },
      { headword: '依赖性', explain: 'dependency; dependence' }
    ])
  })

  it('returns nothing when the body reports a non-success code', () => {
    expect(
      parseYoudaoDictionaryResponse({
        result: { msg: 'error', code: 500 },
        data: { entries: [{ entry: 'dependent', explain: 'adj. 依赖的' }] }
      })
    ).toEqual([])
  })

  it('drops rows missing a headword or a gloss instead of rendering blanks', () => {
    expect(
      parseYoudaoDictionaryResponse({
        result: { code: 200 },
        data: {
          entries: [
            { entry: 'dependent', explain: 'adj. 依赖的' },
            { entry: '', explain: 'adj. 依赖的' },
            { entry: 'dependents' },
            { entry: 'dependently', explain: 42 }
          ]
        }
      })
    ).toEqual([{ headword: 'dependent', explain: 'adj. 依赖的' }])
  })

  it('caps the rows so an oversized payload cannot flood the panel', () => {
    const entries = Array.from({ length: DICTIONARY_LOOKUP_MAX_ENTRIES + 5 }, (_, index) => ({
      entry: `word${index}`,
      explain: 'gloss'
    }))
    expect(
      parseYoudaoDictionaryResponse({ result: { code: 200 }, data: { entries } })
    ).toHaveLength(DICTIONARY_LOOKUP_MAX_ENTRIES)
  })

  it('keeps the first of a repeated headword, which the renderer uses as a row key', () => {
    expect(
      parseYoudaoDictionaryResponse({
        result: { code: 200 },
        data: {
          entries: [
            { entry: 'dependent', explain: 'adj. 依赖的' },
            { entry: 'dependent', explain: 'n. 受供养者' }
          ]
        }
      })
    ).toEqual([{ headword: 'dependent', explain: 'adj. 依赖的' }])
  })

  it('returns nothing for a payload that is not the expected shape', () => {
    expect(parseYoudaoDictionaryResponse(null)).toEqual([])
    expect(parseYoudaoDictionaryResponse('nope')).toEqual([])
    expect(parseYoudaoDictionaryResponse({ data: { entries: 'nope' } })).toEqual([])
    expect(parseYoudaoDictionaryResponse({ result: { code: 200 } })).toEqual([])
  })
})
