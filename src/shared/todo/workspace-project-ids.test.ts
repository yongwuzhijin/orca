import { describe, expect, it } from 'vitest'
import {
  normalizeWorkspaceProjectIds,
  parseWorkspaceProjectIds,
  primaryWorkspaceProjectId
} from './workspace-project-ids'

describe('workspace-project-ids', () => {
  it('parses json arrays and drops invalid entries', () => {
    expect(parseWorkspaceProjectIds('["a","b"]')).toEqual(['a', 'b'])
    expect(parseWorkspaceProjectIds('not-json')).toEqual([])
  })

  it('normalizes ids and keeps primary first', () => {
    expect(normalizeWorkspaceProjectIds(['b', 'a'], 'c')).toEqual(['c', 'b', 'a'])
  })

  it('derives primary from normalized ids', () => {
    expect(primaryWorkspaceProjectId(['a', 'b'], null)).toBe('a')
    expect(primaryWorkspaceProjectId([], 'legacy')).toBe('legacy')
  })
})
