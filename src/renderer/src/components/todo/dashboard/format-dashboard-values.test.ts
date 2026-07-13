import { describe, expect, it } from 'vitest'
import { formatDuration, formatTokens, formatUsd } from './format-dashboard-values'

describe('formatDuration', () => {
  it('formats sub-minute as seconds', () => {
    expect(formatDuration(5000)).toBe('5s')
  })
  it('formats minutes', () => {
    expect(formatDuration(120000)).toBe('2m')
  })
  it('formats hours', () => {
    expect(formatDuration(3 * 3600000)).toBe('3h')
  })
  it('formats days', () => {
    expect(formatDuration(2 * 86400000)).toBe('2d')
  })
  it('formats null as a dash', () => {
    expect(formatDuration(null)).toBe('—')
  })
})

describe('formatTokens', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500')
  })
  it('formats thousands with K', () => {
    expect(formatTokens(12000)).toBe('12.0K')
  })
  it('formats millions with M', () => {
    expect(formatTokens(3_400_000)).toBe('3.4M')
  })
})

describe('formatUsd', () => {
  it('formats with a dollar sign and two decimals', () => {
    expect(formatUsd(1.5)).toBe('$1.50')
  })
})
