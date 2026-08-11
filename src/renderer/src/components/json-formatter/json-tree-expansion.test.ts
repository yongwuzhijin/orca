import { describe, expect, it } from 'vitest'
import {
  collapseAllJsonNodes,
  createJsonExpansion,
  expandAllJsonNodes,
  expandJsonAncestors,
  isJsonNodeCollapsed,
  pruneJsonSubtreeOverrides,
  toggleJsonNode
} from './json-tree-expansion'

describe('createJsonExpansion', () => {
  it('starts fully expanded', () => {
    const expansion = createJsonExpansion()
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(false)
    expect(isJsonNodeCollapsed(expansion, 'a.b[0]')).toBe(false)
  })
})

describe('toggleJsonNode', () => {
  it('collapses a single node without touching siblings', () => {
    const expansion = toggleJsonNode(createJsonExpansion(), 'a')
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(true)
    expect(isJsonNodeCollapsed(expansion, 'b')).toBe(false)
  })

  it('is its own inverse', () => {
    const once = toggleJsonNode(createJsonExpansion(), 'a')
    const twice = toggleJsonNode(once, 'a')
    expect(isJsonNodeCollapsed(twice, 'a')).toBe(false)
  })

  it('does not mutate the previous state', () => {
    const before = createJsonExpansion()
    toggleJsonNode(before, 'a')
    expect(isJsonNodeCollapsed(before, 'a')).toBe(false)
  })
})

describe('collapseAllJsonNodes', () => {
  it('collapses every node', () => {
    const expansion = collapseAllJsonNodes()
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(true)
    expect(isJsonNodeCollapsed(expansion, 'x.y[3]')).toBe(true)
  })

  it('lets one node be expanded again after collapse all', () => {
    const expansion = toggleJsonNode(collapseAllJsonNodes(), 'a')
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(false)
    expect(isJsonNodeCollapsed(expansion, 'b')).toBe(true)
  })

  it('drops overrides so a bulk action reaches every path', () => {
    const overridden = toggleJsonNode(createJsonExpansion(), 'a')
    expect(isJsonNodeCollapsed(overridden, 'a')).toBe(true)

    // Why: a surviving override would invert 'a' back out of each bulk action.
    expect(isJsonNodeCollapsed(collapseAllJsonNodes(), 'a')).toBe(true)
    expect(isJsonNodeCollapsed(expandAllJsonNodes(), 'a')).toBe(false)
    expect(isJsonNodeCollapsed(collapseAllJsonNodes(), 'a')).toBe(
      isJsonNodeCollapsed(collapseAllJsonNodes(), 'never-overridden')
    )
  })
})

describe('expandAllJsonNodes', () => {
  it('expands every node', () => {
    const expansion = expandAllJsonNodes()
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(false)
  })

  it('lets one node be collapsed again after expand all', () => {
    const expansion = toggleJsonNode(expandAllJsonNodes(), 'a')
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(true)
    expect(isJsonNodeCollapsed(expansion, 'b')).toBe(false)
  })
})

describe('expandJsonAncestors', () => {
  it('adds overrides when the default is collapsed', () => {
    const next = expandJsonAncestors(collapseAllJsonNodes(), 'data[0].code')
    expect([...next.overrides].sort()).toEqual(['', 'data', 'data[0]'])
    expect(isJsonNodeCollapsed(next, 'data[0]')).toBe(false)
  })

  it('removes overrides when the default is expanded', () => {
    const collapsed = toggleJsonNode(toggleJsonNode(createJsonExpansion(), 'data'), 'data[0]')
    expect(isJsonNodeCollapsed(collapsed, 'data')).toBe(true)
    const next = expandJsonAncestors(collapsed, 'data[0].code')
    expect(next.overrides.size).toBe(0)
    expect(isJsonNodeCollapsed(next, 'data[0]')).toBe(false)
  })

  it('leaves the node itself alone', () => {
    const next = expandJsonAncestors(collapseAllJsonNodes(), 'data')
    expect([...next.overrides]).toEqual([''])
  })

  it('keeps identity when nothing changes', () => {
    const state = expandJsonAncestors(collapseAllJsonNodes(), 'data[0]')
    expect(expandJsonAncestors(state, 'data[0]')).toBe(state)
  })

  it('is a no-op for the root path', () => {
    const state = collapseAllJsonNodes()
    expect(expandJsonAncestors(state, '')).toBe(state)
  })
})

describe('pruneJsonSubtreeOverrides', () => {
  it('drops the node and its descendants', () => {
    const state = {
      defaultCollapsed: false,
      overrides: new Set(['data[1]', 'data[1].code', 'data[1][0]', 'data[2]'])
    }
    const next = pruneJsonSubtreeOverrides(state, 'data[1]')
    expect([...next.overrides]).toEqual(['data[2]'])
  })

  it('does not treat data[10] as a descendant of data[1]', () => {
    const state = { defaultCollapsed: false, overrides: new Set(['data[10]']) }
    const next = pruneJsonSubtreeOverrides(state, 'data[1]')
    expect([...next.overrides]).toEqual(['data[10]'])
  })

  it('does not treat dataset as a descendant of data', () => {
    const state = { defaultCollapsed: false, overrides: new Set(['dataset']) }
    expect([...pruneJsonSubtreeOverrides(state, 'data').overrides]).toEqual(['dataset'])
  })

  it('keeps identity when nothing matches', () => {
    const state = { defaultCollapsed: false, overrides: new Set(['other']) }
    expect(pruneJsonSubtreeOverrides(state, 'data')).toBe(state)
  })
})
