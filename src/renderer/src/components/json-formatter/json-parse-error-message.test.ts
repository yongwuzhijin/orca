import { describe, expect, it } from 'vitest'
import { describeJsonParseError } from './json-parse-error-message'
import type { JsonParseErrorCode } from './parse-json-input'

const CODES: JsonParseErrorCode[] = [
  'too-large',
  'too-deep',
  'unexpected-end',
  'invalid-symbol',
  'invalid-number',
  'invalid-escape',
  'comments-not-allowed',
  'trailing-content',
  'syntax'
]

describe('describeJsonParseError', () => {
  it('returns a distinct non-empty message for every code', () => {
    const messages = CODES.map((code) =>
      describeJsonParseError({ status: 'error', code, line: 2, column: 5 })
    )
    for (const message of messages) {
      expect(message).toBeTruthy()
    }
    // Why: each code maps to different prose, so one shared string would be a bug.
    expect(new Set(messages).size).toBe(CODES.length)
  })

  it('includes the line and column for positional errors', () => {
    const message = describeJsonParseError({
      status: 'error',
      code: 'invalid-symbol',
      line: 2,
      column: 5
    })
    expect(message).toContain('2')
    expect(message).toContain('5')
  })

  it('omits the position for codes that carry no real position', () => {
    for (const code of ['too-large', 'too-deep'] as const) {
      const message = describeJsonParseError({ status: 'error', code, line: 1, column: 1 })
      expect(message).not.toMatch(/\d/)
      // Why: a fabricated 1:1 must not leak, so the copy has to be position-invariant.
      expect(describeJsonParseError({ status: 'error', code, line: 9, column: 7 })).toBe(message)
    }
  })
})
