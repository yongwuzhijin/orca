import { describe, expect, it } from 'vitest'
import { parseMyMemoryResponse } from './mymemory-response'

// Recorded from api.mymemory.translated.net so a shape change fails here, not in the UI.
const SUCCESS = {
  responseData: { translatedText: '缓存很冷。', match: 0.85 },
  quotaFinished: false,
  mtLangSupported: null,
  responseDetails: '',
  responseStatus: 200,
  responderId: null,
  exception_code: null,
  matches: [{ id: 0, segment: 'The cache was cold.', translation: '缓存很冷。' }]
}

describe('parseMyMemoryResponse', () => {
  it('reads the translation out of responseData', () => {
    expect(parseMyMemoryResponse(SUCCESS)).toEqual({ ok: true, translatedText: '缓存很冷。' })
  })

  it('reports quota exhaustion as rate-limited even though the HTTP status is 200', () => {
    // Why: MyMemory signals the daily cap in the body, so a 200 can still be a refusal.
    expect(
      parseMyMemoryResponse({
        responseData: { translatedText: 'The cache was cold.' },
        quotaFinished: true,
        responseStatus: 200
      })
    ).toEqual({ ok: false, kind: 'rate-limited' })
  })

  it('treats the all-caps quota warning as rate-limited', () => {
    expect(
      parseMyMemoryResponse({
        responseData: {
          translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.'
        },
        responseStatus: 200
      })
    ).toEqual({ ok: false, kind: 'rate-limited' })
  })

  it('treats a 429 reported in the body as rate-limited', () => {
    expect(
      parseMyMemoryResponse({ responseData: { translatedText: 'x' }, responseStatus: '429' })
    ).toEqual({ ok: false, kind: 'rate-limited' })
  })

  it('reports a non-2xx body status as a provider error', () => {
    expect(
      parseMyMemoryResponse({
        responseData: { translatedText: 'INVALID LANGUAGE PAIR' },
        responseStatus: 403
      })
    ).toEqual({ ok: false, kind: 'provider-error' })
  })

  it('reports shapes it does not recognize as a provider error', () => {
    expect(parseMyMemoryResponse(null)).toEqual({ ok: false, kind: 'provider-error' })
    expect(parseMyMemoryResponse('<html>502</html>')).toEqual({ ok: false, kind: 'provider-error' })
    expect(parseMyMemoryResponse({})).toEqual({ ok: false, kind: 'provider-error' })
    expect(parseMyMemoryResponse({ responseData: { translatedText: '' } })).toEqual({
      ok: false,
      kind: 'provider-error'
    })
    expect(parseMyMemoryResponse({ responseData: { translatedText: 42 } })).toEqual({
      ok: false,
      kind: 'provider-error'
    })
  })
})
