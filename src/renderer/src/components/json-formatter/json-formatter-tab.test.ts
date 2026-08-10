import { describe, expect, it } from 'vitest'
import { buildJsonFormatterTabId } from './json-formatter-tab'

describe('buildJsonFormatterTabId', () => {
  it('derives a stable id per worktree', () => {
    expect(buildJsonFormatterTabId('wt-1')).toBe('wt-1::json-formatter')
    expect(buildJsonFormatterTabId('wt-1')).toBe(buildJsonFormatterTabId('wt-1'))
  })

  it('gives different worktrees different ids', () => {
    expect(buildJsonFormatterTabId('wt-1')).not.toBe(buildJsonFormatterTabId('wt-2'))
  })
})
