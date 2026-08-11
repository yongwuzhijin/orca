import { describe, expect, it } from 'vitest'
import { buildJsonPairText, buildJsonValueText } from './json-copy-text'
import type { JsonTreeRow } from './json-tree-rows'

function makeRow(overrides: Partial<JsonTreeRow>): JsonTreeRow {
  return {
    path: 'data[0].code',
    segments: ['data', 0, 'code'],
    depth: 3,
    kind: 'string',
    label: 'code',
    labelKind: 'key',
    value: 'psfwlx',
    childCount: 0,
    isExpandable: false,
    isCollapsed: false,
    ...overrides
  }
}

describe('buildJsonPairText', () => {
  it('keeps the key for object entries', () => {
    expect(buildJsonPairText(makeRow({}))).toBe('"code": "psfwlx"')
  })

  it('escapes keys that need it', () => {
    expect(buildJsonPairText(makeRow({ label: 'a b', value: 1, kind: 'number' }))).toBe('"a b": 1')
  })

  it('drops to the bare value for array elements', () => {
    expect(buildJsonPairText(makeRow({ label: '0', labelKind: 'index', value: 'x' }))).toBe('"x"')
  })

  it('drops to the bare value for the root node', () => {
    expect(
      buildJsonPairText(makeRow({ label: null, labelKind: null, kind: 'object', value: { a: 1 } }))
    ).toBe('{\n  "a": 1\n}')
  })

  it('pretty-prints container values with two-space indent', () => {
    expect(
      buildJsonPairText(
        makeRow({ label: 'values', kind: 'array', value: ['00fnsfdd'], childCount: 1 })
      )
    ).toBe('"values": [\n  "00fnsfdd"\n]')
  })
})

describe('buildJsonValueText', () => {
  it('strips the quotes from scalar strings', () => {
    expect(buildJsonValueText(makeRow({}))).toBe('psfwlx')
  })

  it('keeps JSON form for non-strings', () => {
    expect(buildJsonValueText(makeRow({ kind: 'number', value: 42 }))).toBe('42')
    expect(buildJsonValueText(makeRow({ kind: 'boolean', value: true }))).toBe('true')
    expect(buildJsonValueText(makeRow({ kind: 'null', value: null }))).toBe('null')
  })

  it('keeps JSON form for containers', () => {
    expect(buildJsonValueText(makeRow({ kind: 'array', value: ['00fnsfdd'], childCount: 1 }))).toBe(
      '[\n  "00fnsfdd"\n]'
    )
  })
})
