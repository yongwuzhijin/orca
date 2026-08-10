import { describe, expect, it } from 'vitest'
import { unescapeJsonText } from './json-unescape'

describe('unescapeJsonText', () => {
  it('unescapes quotes and backslashes', () => {
    expect(unescapeJsonText('{\\"a\\":1}')).toBe('{"a":1}')
    expect(unescapeJsonText('a\\\\b')).toBe('a\\b')
  })

  it('unescapes whitespace and solidus sequences', () => {
    expect(unescapeJsonText('a\\nb')).toBe('a\nb')
    expect(unescapeJsonText('a\\tb')).toBe('a\tb')
    expect(unescapeJsonText('a\\rb')).toBe('a\rb')
    expect(unescapeJsonText('a\\bb')).toBe('a\bb')
    expect(unescapeJsonText('a\\fb')).toBe('a\fb')
    expect(unescapeJsonText('http:\\/\\/x')).toBe('http://x')
  })

  it('unescapes unicode sequences', () => {
    expect(unescapeJsonText('\\u4e2d\\u6587')).toBe('中文')
  })

  it('strips a matching pair of wrapping quotes', () => {
    expect(unescapeJsonText('"{\\"a\\":1}"')).toBe('{"a":1}')
  })

  it('keeps quotes that are not a wrapping pair', () => {
    expect(unescapeJsonText('"a"+"b"')).toBe('"a"+"b"')
    expect(unescapeJsonText('"unterminated')).toBe('"unterminated')
  })

  it('peels only one layer of escaping', () => {
    expect(unescapeJsonText('{\\\\"a\\\\":1}')).toBe('{\\"a\\":1}')
  })

  it('returns plain content unchanged', () => {
    expect(unescapeJsonText('{"a":1}')).toBe('{"a":1}')
    expect(unescapeJsonText('')).toBe('')
  })

  it('leaves unknown escape sequences alone', () => {
    expect(unescapeJsonText('a\\qb')).toBe('a\\qb')
  })
})
