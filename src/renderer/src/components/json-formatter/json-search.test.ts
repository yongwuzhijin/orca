import { describe, expect, it } from 'vitest'
import { findJsonMatches, findTextRanges } from './json-search'

describe('findTextRanges', () => {
  it('returns nothing for an empty query', () => {
    expect(findTextRanges('abc', '')).toEqual([])
  })

  it('is case insensitive', () => {
    expect(findTextRanges('AbCabc', 'ABC')).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 }
    ])
  })

  it('does not overlap matches', () => {
    expect(findTextRanges('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 }
    ])
  })

  it('returns nothing when absent', () => {
    expect(findTextRanges('abc', 'z')).toEqual([])
  })
})

describe('findJsonMatches', () => {
  it('returns nothing for an empty query', () => {
    expect(findJsonMatches({ code: 'x' }, '')).toEqual([])
  })

  it('matches keys and values in document order, key before value', () => {
    expect(findJsonMatches({ code: 'code-1' }, 'code')).toEqual([
      { path: 'code', field: 'key', start: 1, end: 5 },
      { path: 'code', field: 'value', start: 1, end: 5 }
    ])
  })

  it('uses display-text offsets, so quotes shift the start', () => {
    const [match] = findJsonMatches({ ab: 1 }, 'ab')
    expect(match).toEqual({ path: 'ab', field: 'key', start: 1, end: 3 })
  })

  it('searches numbers, booleans and null by their rendered text', () => {
    expect(findJsonMatches({ a: 1234 }, '23')).toEqual([
      { path: 'a', field: 'value', start: 1, end: 3 }
    ])
    expect(findJsonMatches({ a: true }, 'ru')).toEqual([
      { path: 'a', field: 'value', start: 1, end: 3 }
    ])
    expect(findJsonMatches({ a: null }, 'ull')).toEqual([
      { path: 'a', field: 'value', start: 1, end: 4 }
    ])
  })

  it('matches container keys but never their summary text', () => {
    expect(findJsonMatches({ data: { a: 1 } }, 'data')).toEqual([
      { path: 'data', field: 'key', start: 1, end: 5 }
    ])
    expect(findJsonMatches({ data: { a: 1 } }, '…')).toEqual([])
  })

  it('does not match array indices as keys', () => {
    expect(findJsonMatches({ list: ['0'] }, '0')).toEqual([
      { path: 'list[0]', field: 'value', start: 1, end: 2 }
    ])
  })

  it('walks the whole tree regardless of expansion state', () => {
    const deep = { a: { b: { c: { d: 'needle' } } } }
    expect(findJsonMatches(deep, 'needle')).toEqual([
      { path: 'a.b.c.d', field: 'value', start: 1, end: 7 }
    ])
  })

  it('keeps document order across siblings', () => {
    expect(findJsonMatches({ x: 'q', y: { z: 'q' }, w: 'q' }, 'q').map((m) => m.path)).toEqual([
      'x',
      'y.z',
      'w'
    ])
  })

  it('survives nesting far deeper than the call stack', () => {
    let deep: unknown = 'needle'
    for (let index = 0; index < 20000; index += 1) {
      deep = { a: deep }
    }
    expect(findJsonMatches(deep, 'needle')).toHaveLength(1)
  })
})
