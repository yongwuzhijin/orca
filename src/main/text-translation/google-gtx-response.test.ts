import { describe, expect, it } from 'vitest'
import { parseGoogleGtxResponse } from './google-gtx-response'

// Recorded from translate.googleapis.com so a shape change fails here, not in the UI.
const SINGLE_SEGMENT = [
  [
    [
      '这个接口返回值被缓存了',
      'The response of this interface is cached',
      null,
      null,
      3,
      null,
      null,
      [[]],
      [[['af64405095a399ceb1e05c7abb7cda66', 'en_zh_2023q1.md']]]
    ]
  ],
  null,
  'en',
  null,
  null,
  null,
  1,
  [],
  [['en'], null, [1], ['en']]
]

const MULTI_SEGMENT = [
  [
    ['缓存很冷。', 'The cache was cold. ', null, null, 3],
    ['第二个请求命中缓存。', 'The second request hit the cache. ', null, null, 3],
    ['延迟降至 40 毫秒。', 'Latency dropped to 40ms.', null, null, 3]
  ],
  null,
  'en',
  null,
  null,
  null,
  1,
  [],
  [['en'], null, [1], ['en']]
]

describe('parseGoogleGtxResponse', () => {
  it('reads the translation and detected source from a single segment', () => {
    expect(parseGoogleGtxResponse(SINGLE_SEGMENT)).toEqual({
      translatedText: '这个接口返回值被缓存了',
      detectedSourceLanguage: 'en'
    })
  })

  it('concatenates every segment so long input is not truncated', () => {
    expect(parseGoogleGtxResponse(MULTI_SEGMENT)?.translatedText).toBe(
      '缓存很冷。第二个请求命中缓存。延迟降至 40 毫秒。'
    )
  })

  it('skips segments whose translation slot is not a string', () => {
    const withTransliteration = [
      [
        ['缓存很冷。', 'The cache was cold.'],
        [null, null, 'huan cun hen leng']
      ],
      null,
      'en'
    ]
    expect(parseGoogleGtxResponse(withTransliteration)?.translatedText).toBe('缓存很冷。')
  })

  it('reports a missing detected language as null rather than guessing', () => {
    expect(parseGoogleGtxResponse([[['你好', 'hello']], null, null])).toEqual({
      translatedText: '你好',
      detectedSourceLanguage: null
    })
  })

  it('returns null for shapes it does not recognize', () => {
    expect(parseGoogleGtxResponse(null)).toBeNull()
    expect(parseGoogleGtxResponse({})).toBeNull()
    expect(parseGoogleGtxResponse([])).toBeNull()
    expect(parseGoogleGtxResponse(['not-an-array'])).toBeNull()
    expect(parseGoogleGtxResponse('<html>429</html>')).toBeNull()
  })

  it('returns null when no segment carries a translation', () => {
    expect(parseGoogleGtxResponse([[[null, 'hello']], null, 'en'])).toBeNull()
  })
})
