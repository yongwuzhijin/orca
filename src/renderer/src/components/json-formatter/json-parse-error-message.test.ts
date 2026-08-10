import { describe, expect, it } from 'vitest'
import { describeJsonParseError } from './json-parse-error-message'
import type { JsonParseErrorCode } from './parse-json-input'

const CODES: JsonParseErrorCode[] = [
  'too-large',
  'too-deep',
  'unexpected-end',
  'invalid-symbol',
  'invalid-number',
  'trailing-content',
  'syntax'
]

describe('describeJsonParseError', () => {
  it('returns a non-empty message for every code', () => {
    for (const code of CODES) {
      expect(describeJsonParseError({ status: 'error', code, line: 2, column: 5 })).toBeTruthy()
    }
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

  it('omits the position for size errors', () => {
    const message = describeJsonParseError({
      status: 'error',
      code: 'too-large',
      line: 1,
      column: 1
    })
    expect(message).not.toContain('1:1')
  })
})
