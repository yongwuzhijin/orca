import { describe, expect, it } from 'vitest'
import { collapseAllJsonNodes, createJsonExpansion, toggleJsonNode } from './json-tree-expansion'
import { buildVisibleJsonRows } from './json-tree-rows'

describe('buildVisibleJsonRows', () => {
  it('flattens a nested object depth-first', () => {
    const rows = buildVisibleJsonRows({ a: { b: 1 } }, createJsonExpansion())
    expect(rows.map((row) => ({ path: row.path, depth: row.depth, kind: row.kind }))).toEqual([
      { path: '', depth: 0, kind: 'object' },
      { path: 'a', depth: 1, kind: 'object' },
      { path: 'a.b', depth: 2, kind: 'number' }
    ])
  })

  it('labels object entries with their key and array entries with their index', () => {
    const rows = buildVisibleJsonRows({ list: ['x'] }, createJsonExpansion())
    expect(rows[1]).toMatchObject({ label: 'list', labelKind: 'key' })
    expect(rows[2]).toMatchObject({ label: '0', labelKind: 'index', kind: 'string' })
  })

  it('omits children of collapsed containers', () => {
    const expansion = toggleJsonNode(createJsonExpansion(), 'a')
    const rows = buildVisibleJsonRows({ a: { b: 1 }, c: 2 }, expansion)
    expect(rows.map((row) => row.path)).toEqual(['', 'a', 'c'])
    expect(rows[1]).toMatchObject({ isCollapsed: true, isExpandable: true })
  })

  it('keeps only the root visible after collapse all', () => {
    const rows = buildVisibleJsonRows({ a: { b: 1 } }, collapseAllJsonNodes())
    expect(rows.map((row) => row.path)).toEqual([''])
  })

  it('records child counts on containers', () => {
    const rows = buildVisibleJsonRows({ a: [1, 2, 3] }, createJsonExpansion())
    expect(rows[0]).toMatchObject({ kind: 'object', childCount: 1 })
    expect(rows[1]).toMatchObject({ kind: 'array', childCount: 3 })
  })

  it('treats empty containers as not expandable', () => {
    const rows = buildVisibleJsonRows({ a: {}, b: [] }, createJsonExpansion())
    expect(rows[1]).toMatchObject({ path: 'a', childCount: 0, isExpandable: false })
    expect(rows[2]).toMatchObject({ path: 'b', childCount: 0, isExpandable: false })
  })

  it('classifies scalar kinds', () => {
    const rows = buildVisibleJsonRows({ s: 'x', n: 1, b: true, z: null }, createJsonExpansion())
    expect(rows.slice(1).map((row) => row.kind)).toEqual(['string', 'number', 'boolean', 'null'])
  })

  it('handles a scalar root', () => {
    const rows = buildVisibleJsonRows(42, createJsonExpansion())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ path: '', depth: 0, kind: 'number', label: null })
  })

  it('brackets keys that are not identifiers', () => {
    const rows = buildVisibleJsonRows({ 'my key': 1 }, createJsonExpansion())
    expect(rows[1]?.path).toBe('["my key"]')
  })

  it('keeps siblings in source order while descending into each subtree', () => {
    const rows = buildVisibleJsonRows(
      { a: { a1: 1, a2: 2 }, b: [10, [11]], c: 3 },
      createJsonExpansion()
    )
    expect(rows.map((row) => row.path)).toEqual([
      '',
      'a',
      'a.a1',
      'a.a2',
      'b',
      'b[0]',
      'b[1]',
      'b[1][0]',
      'c'
    ])
  })

  // Why: jsonc-parser accepts nesting deeper than closure recursion survived, so a paste
  // in that gap parsed fine and then overflowed the stack while flattening rows.
  it('walks nesting deeper than the call stack allows', () => {
    const depth = 10_000
    let deep: unknown = 1
    for (let level = 0; level < depth; level += 1) {
      deep = [deep]
    }

    const rows = buildVisibleJsonRows(deep, createJsonExpansion())
    expect(rows).toHaveLength(depth + 1)
    expect(rows.map((row) => row.depth)).toEqual(rows.map((_row, index) => index))
    expect(rows.at(-1)).toMatchObject({ kind: 'number', value: 1, isExpandable: false })
  })
})
