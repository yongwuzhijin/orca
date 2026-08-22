import { describe, expect, it } from 'vitest'
import { toCdpUrlPattern } from './browser-network-cdp-url-pattern'

describe('toCdpUrlPattern', () => {
  it('passes a literal pattern through', () => {
    expect(toCdpUrlPattern('https://api.example.com/v1/users')).toBe(
      'https://api.example.com/v1/users'
    )
  })

  it('keeps our wildcard, which means the same thing in both dialects', () => {
    expect(toCdpUrlPattern('https://*.example.com/*')).toBe('https://*.example.com/*')
  })

  it('escapes a query string so CDP does not read ? as a single-character wildcard', () => {
    expect(toCdpUrlPattern('https://x.test/search?q=1')).toBe('https://x.test/search\\?q=1')
  })

  it('escapes a backslash so CDP does not read it as an escape', () => {
    expect(toCdpUrlPattern('https://x.test/a\\b')).toBe('https://x.test/a\\\\b')
  })

  it('escapes every occurrence, not just the first', () => {
    expect(toCdpUrlPattern('a?b?c')).toBe('a\\?b\\?c')
  })

  it('leaves an empty pattern alone', () => {
    expect(toCdpUrlPattern('')).toBe('')
  })
})
