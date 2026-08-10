import { describe, expect, it } from 'vitest'
import { MAX_JSON_INPUT_BYTES, parseJsonInput } from './parse-json-input'

describe('parseJsonInput', () => {
  it('reports an empty result for blank input', () => {
    expect(parseJsonInput('', { keepEscapes: true })).toEqual({ status: 'empty' })
    expect(parseJsonInput('   \n ', { keepEscapes: true })).toEqual({ status: 'empty' })
  })

  it('parses valid objects and arrays', () => {
    expect(parseJsonInput('{"a":1}', { keepEscapes: true })).toEqual({
      status: 'ok',
      value: { a: 1 }
    })
    expect(parseJsonInput('[1,"two",null]', { keepEscapes: true })).toEqual({
      status: 'ok',
      value: [1, 'two', null]
    })
  })

  it('parses scalar roots', () => {
    expect(parseJsonInput('42', { keepEscapes: true })).toEqual({ status: 'ok', value: 42 })
    expect(parseJsonInput('true', { keepEscapes: true })).toEqual({ status: 'ok', value: true })
    expect(parseJsonInput('null', { keepEscapes: true })).toEqual({ status: 'ok', value: null })
  })

  it('reports the line and column of a syntax error', () => {
    const result = parseJsonInput('{\n  "a": 1,\n  "b"\n}', { keepEscapes: true })
    expect(result.status).toBe('error')
    if (result.status !== 'error') {
      return
    }
    expect(result.line).toBe(4)
    expect(result.column).toBeGreaterThan(0)
    expect(result.code).toBeTruthy()
  })

  it('reports column 1-based on the first line', () => {
    const result = parseJsonInput('nope', { keepEscapes: true })
    expect(result.status).toBe('error')
    if (result.status !== 'error') {
      return
    }
    expect(result.line).toBe(1)
    expect(result.column).toBe(1)
  })

  it('maps truncated input to unexpected-end and extra input to trailing-content', () => {
    const codeOf = (input: string): unknown => {
      const result = parseJsonInput(input, { keepEscapes: true })
      return result.status === 'error' ? result.code : result.status
    }
    expect(codeOf('{"a":1')).toBe('unexpected-end')
    expect(codeOf('[1,2')).toBe('unexpected-end')
    expect(codeOf('"abc')).toBe('unexpected-end')
    expect(codeOf('{"a":1}{')).toBe('trailing-content')
    expect(codeOf('{"a":@}')).toBe('invalid-symbol')
  })

  it('unescapes before parsing when keepEscapes is false', () => {
    const escaped = '"{\\"a\\":1}"'
    expect(parseJsonInput(escaped, { keepEscapes: true })).toEqual({
      status: 'ok',
      value: '{"a":1}'
    })
    expect(parseJsonInput(escaped, { keepEscapes: false })).toEqual({
      status: 'ok',
      value: { a: 1 }
    })
  })

  it('refuses input above the size limit', () => {
    const huge = `"${'x'.repeat(MAX_JSON_INPUT_BYTES)}"`
    expect(parseJsonInput(huge, { keepEscapes: true })).toEqual({
      status: 'error',
      code: 'too-large',
      line: 1,
      column: 1
    })
  })

  // Why: parse() recurses, so nesting overflows the stack at a size the guard lets through.
  it('reports too-deep instead of throwing on deeply nested input', () => {
    const depth = 20_000
    const nested = `${'['.repeat(depth)}1${']'.repeat(depth)}`
    expect(nested.length).toBeLessThan(MAX_JSON_INPUT_BYTES)
    expect(parseJsonInput(nested, { keepEscapes: true })).toEqual({
      status: 'error',
      code: 'too-deep',
      line: 1,
      column: 1
    })
  })
})
