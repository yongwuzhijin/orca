import { describe, expect, it } from 'vitest'
import { formatJsonContainerText, formatJsonRowLabel, formatJsonScalarText } from './json-row-text'

describe('formatJsonRowLabel', () => {
  it('quotes and escapes object keys', () => {
    expect(formatJsonRowLabel('code', 'key')).toBe('"code"')
    expect(formatJsonRowLabel('a"b', 'key')).toBe('"a\\"b"')
    expect(formatJsonRowLabel('a\nb', 'key')).toBe('"a\\nb"')
  })

  it('renders array indices bare', () => {
    expect(formatJsonRowLabel('0', 'index')).toBe('0')
    expect(formatJsonRowLabel('12', 'index')).toBe('12')
  })
})

describe('formatJsonScalarText', () => {
  it('quotes strings and spells out null', () => {
    expect(formatJsonScalarText('psfwlx', 'string')).toBe('"psfwlx"')
    expect(formatJsonScalarText(null, 'null')).toBe('null')
  })

  it('stringifies numbers and booleans', () => {
    expect(formatJsonScalarText(42, 'number')).toBe('42')
    expect(formatJsonScalarText(-1.5, 'number')).toBe('-1.5')
    expect(formatJsonScalarText(true, 'boolean')).toBe('true')
    expect(formatJsonScalarText(false, 'boolean')).toBe('false')
  })
})

describe('formatJsonContainerText', () => {
  it('collapses empty containers to their brackets', () => {
    expect(formatJsonContainerText('object', 0)).toBe('{}')
    expect(formatJsonContainerText('array', 0)).toBe('[]')
  })

  it('summarises non-empty containers with a child count', () => {
    expect(formatJsonContainerText('object', 8)).toBe('{ … }  8')
    expect(formatJsonContainerText('array', 1)).toBe('[ … ]  1')
  })
})
