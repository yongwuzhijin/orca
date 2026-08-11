import { describe, expect, it } from 'vitest'
import {
  JSON_ROOT_PATH,
  appendJsonArrayIndex,
  appendJsonObjectKey,
  listJsonAncestorPaths,
  toCopyablePath
} from './json-path'

describe('appendJsonObjectKey', () => {
  it('starts a path from the root without a $ prefix', () => {
    expect(appendJsonObjectKey(JSON_ROOT_PATH, 'retailer')).toBe('retailer')
  })

  it('uses dot notation for identifier-like keys', () => {
    expect(appendJsonObjectKey('retailer', 'poiId')).toBe('retailer.poiId')
    expect(appendJsonObjectKey('a', '_b')).toBe('a._b')
    expect(appendJsonObjectKey('a', '$c')).toBe('a.$c')
  })

  it('brackets keys that are not valid identifiers', () => {
    expect(appendJsonObjectKey('a', 'my key')).toBe('a["my key"]')
    expect(appendJsonObjectKey('a', '0abc')).toBe('a["0abc"]')
    expect(appendJsonObjectKey('a', 'x-y')).toBe('a["x-y"]')
    expect(appendJsonObjectKey('a', '')).toBe('a[""]')
  })

  it('brackets a non-identifier first segment', () => {
    expect(appendJsonObjectKey(JSON_ROOT_PATH, 'my key')).toBe('["my key"]')
  })

  it('escapes quotes and backslashes inside bracketed keys', () => {
    expect(appendJsonObjectKey('a', 'say "hi"')).toBe('a["say \\"hi\\""]')
    expect(appendJsonObjectKey('a', 'back\\slash')).toBe('a["back\\\\slash"]')
  })

  it('escapes control characters inside bracketed keys', () => {
    expect(appendJsonObjectKey('a', 'x\ny')).toBe('a["x\\ny"]')
    expect(appendJsonObjectKey('a', 'x\ry')).toBe('a["x\\ry"]')
    expect(appendJsonObjectKey('a', 'x\ty')).toBe('a["x\\ty"]')
    expect(appendJsonObjectKey('a', 'x\by')).toBe('a["x\\by"]')
    expect(appendJsonObjectKey('a', 'x\fy')).toBe('a["x\\fy"]')
  })

  it('keeps a bracketed key single-line and JSON-parseable', () => {
    const path = appendJsonObjectKey('a', 'x\n"y"\\z')
    expect(path).not.toMatch(/\n/)
    expect(JSON.parse(path.slice(2, -1))).toBe('x\n"y"\\z')
  })
})

describe('appendJsonArrayIndex', () => {
  it('appends bracketed indexes', () => {
    expect(appendJsonArrayIndex('list', 0)).toBe('list[0]')
    expect(appendJsonArrayIndex('a.b', 12)).toBe('a.b[12]')
  })

  it('keeps root-level array indexes bare', () => {
    expect(appendJsonArrayIndex(JSON_ROOT_PATH, 3)).toBe('[3]')
  })

  it('composes deep paths', () => {
    const path = appendJsonObjectKey(
      appendJsonArrayIndex(appendJsonObjectKey(JSON_ROOT_PATH, 'a'), 0),
      'd'
    )
    expect(path).toBe('a[0].d')
  })
})

describe('toCopyablePath', () => {
  it('maps the root path to $', () => {
    expect(toCopyablePath(JSON_ROOT_PATH)).toBe('$')
  })

  it('returns other paths unchanged', () => {
    expect(toCopyablePath('a.b[0]')).toBe('a.b[0]')
  })
})

describe('listJsonAncestorPaths', () => {
  it('returns nothing for the root', () => {
    expect(listJsonAncestorPaths('')).toEqual([])
  })

  it('lists the root for a top-level key', () => {
    expect(listJsonAncestorPaths('data')).toEqual([''])
  })

  it('walks dot and bracket boundaries', () => {
    expect(listJsonAncestorPaths('data[0].code')).toEqual(['', 'data', 'data[0]'])
  })

  it('handles pure array nesting', () => {
    expect(listJsonAncestorPaths('a[0][1]')).toEqual(['', 'a', 'a[0]'])
  })

  it('ignores separators inside quoted keys', () => {
    expect(listJsonAncestorPaths('["a.b"].c')).toEqual(['', '["a.b"]'])
    expect(listJsonAncestorPaths('["a[0]"].c')).toEqual(['', '["a[0]"]'])
  })

  it('ignores escaped quotes inside keys', () => {
    expect(listJsonAncestorPaths('["a\\"b"].c')).toEqual(['', '["a\\"b"]'])
  })
})
