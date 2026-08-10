import { describe, expect, it } from 'vitest'
import { buildJsonFormatterTabId, getJsonFormatterTabLabel } from './json-formatter-tab'

describe('buildJsonFormatterTabId', () => {
  it('derives a stable id per worktree', () => {
    expect(buildJsonFormatterTabId('wt-1')).toBe('wt-1::json-formatter')
  })

  it('gives different worktrees different ids', () => {
    expect(buildJsonFormatterTabId('wt-1')).not.toBe(buildJsonFormatterTabId('wt-2'))
  })
})

describe('getJsonFormatterTabLabel', () => {
  it('resolves to a non-empty label rather than the raw key', () => {
    const label = getJsonFormatterTabLabel()
    expect(label).not.toBe('')
    expect(label).not.toContain('auto.components.')
  })
})
