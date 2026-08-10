import { describe, expect, it } from 'vitest'
import {
  collapseAllJsonNodes,
  createJsonExpansion,
  expandAllJsonNodes,
  isJsonNodeCollapsed,
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

  it('drops overrides from the previous state', () => {
    const toggled = toggleJsonNode(createJsonExpansion(), 'a')
    expect(isJsonNodeCollapsed(toggled, 'a')).toBe(true)
    const expansion = collapseAllJsonNodes()
    expect(isJsonNodeCollapsed(expansion, 'a')).toBe(true)
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
