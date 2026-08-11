import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  clampSplitRatio
} from './json-formatter-split-ratio'

describe('clampSplitRatio', () => {
  it('passes a ratio inside the band through untouched', () => {
    expect(clampSplitRatio(0.5)).toBe(0.5)
    expect(clampSplitRatio(0.21)).toBe(0.21)
    expect(clampSplitRatio(0.79)).toBe(0.79)
  })

  it('clamps a drag past either edge to the band boundary', () => {
    expect(clampSplitRatio(0)).toBe(MIN_SPLIT_RATIO)
    expect(clampSplitRatio(-4)).toBe(MIN_SPLIT_RATIO)
    expect(clampSplitRatio(1)).toBe(MAX_SPLIT_RATIO)
    expect(clampSplitRatio(9)).toBe(MAX_SPLIT_RATIO)
  })

  it('keeps the boundary values themselves', () => {
    expect(clampSplitRatio(MIN_SPLIT_RATIO)).toBe(MIN_SPLIT_RATIO)
    expect(clampSplitRatio(MAX_SPLIT_RATIO)).toBe(MAX_SPLIT_RATIO)
  })

  // Why: a zero-width container divides to NaN, and NaN survives Math.min/max —
  // it would reach the style attribute as `width: NaN%` and collapse the pane.
  it('falls back to the default rather than propagating a non-finite ratio', () => {
    expect(clampSplitRatio(Number.NaN)).toBe(DEFAULT_SPLIT_RATIO)
    expect(clampSplitRatio(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SPLIT_RATIO)
    expect(clampSplitRatio(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_SPLIT_RATIO)
  })
})
