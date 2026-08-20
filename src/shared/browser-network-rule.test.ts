import { describe, expect, it } from 'vitest'
import {
  matchesBrowserNetworkRule,
  matchesBrowserNetworkUrlPattern,
  sanitizeBrowserNetworkRule,
  type BrowserNetworkRule
} from './browser-network-rule'

const RULE: BrowserNetworkRule = {
  id: 'r1',
  label: 'staging auth',
  enabled: true,
  match: { urlPattern: 'https://api.example.com/*' },
  headers: [{ target: 'request', op: 'set', name: 'Authorization', value: 'Bearer x' }]
}

describe('matchesBrowserNetworkUrlPattern', () => {
  it('matches a literal pattern only on an exact URL', () => {
    expect(matchesBrowserNetworkUrlPattern('https://a.com/x', 'https://a.com/x')).toBe(true)
    expect(matchesBrowserNetworkUrlPattern('https://a.com/x', 'https://a.com/xyz')).toBe(false)
  })

  it('matches a trailing wildcard', () => {
    expect(matchesBrowserNetworkUrlPattern('https://a.com/*', 'https://a.com/x/y?q=1')).toBe(true)
    expect(matchesBrowserNetworkUrlPattern('https://a.com/*', 'https://b.com/x')).toBe(false)
  })

  it('matches a leading wildcard', () => {
    expect(matchesBrowserNetworkUrlPattern('*/graphql', 'https://a.com/graphql')).toBe(true)
    expect(matchesBrowserNetworkUrlPattern('*/graphql', 'https://a.com/graphql?x=1')).toBe(false)
  })

  it('matches a wildcard in the middle', () => {
    expect(matchesBrowserNetworkUrlPattern('https://*/api', 'https://a.com/api')).toBe(true)
  })

  it('matches multiple wildcards in order', () => {
    expect(
      matchesBrowserNetworkUrlPattern('https://*/api/*/items', 'https://a.com/api/7/items')
    ).toBe(true)
    expect(
      matchesBrowserNetworkUrlPattern('https://*/api/*/items', 'https://a.com/items/api/7')
    ).toBe(false)
  })

  it('treats a bare wildcard as match-anything', () => {
    expect(matchesBrowserNetworkUrlPattern('*', 'http://localhost:3000/')).toBe(true)
  })

  it('does not let overlapping segments match twice', () => {
    expect(matchesBrowserNetworkUrlPattern('*abcabc*', 'https://a.com/abc')).toBe(false)
    expect(matchesBrowserNetworkUrlPattern('*abc*abc*', 'https://a.com/abc')).toBe(false)
    expect(matchesBrowserNetworkUrlPattern('*abc*abc*', 'https://a.com/abc/abc')).toBe(true)
  })

  it('lets the head and tail share no characters with each other', () => {
    expect(matchesBrowserNetworkUrlPattern('abc*abc', 'abcabc')).toBe(true)
    expect(matchesBrowserNetworkUrlPattern('a*a', 'a')).toBe(false)
  })

  it('handles an empty pattern without throwing', () => {
    expect(matchesBrowserNetworkUrlPattern('', 'https://a.com')).toBe(false)
    expect(matchesBrowserNetworkUrlPattern('', '')).toBe(true)
  })

  it('treats consecutive wildcards as match-anything', () => {
    expect(matchesBrowserNetworkUrlPattern('**', 'anything')).toBe(true)
  })

  it('rejects a pattern longer than the url', () => {
    expect(matchesBrowserNetworkUrlPattern('https://a.com/long/path', 'https://a.com')).toBe(false)
  })

  it('matches a unicode url', () => {
    expect(matchesBrowserNetworkUrlPattern('https://a.com/*', 'https://a.com/日本語?q=值')).toBe(
      true
    )
  })
})

describe('matchesBrowserNetworkRule', () => {
  it('ignores a disabled rule', () => {
    expect(
      matchesBrowserNetworkRule(
        { ...RULE, enabled: false },
        { url: 'https://api.example.com/v1', method: 'GET' }
      )
    ).toBe(false)
  })

  it('filters by method case-insensitively', () => {
    const scoped = { ...RULE, match: { ...RULE.match, methods: ['post'] } }
    expect(
      matchesBrowserNetworkRule(scoped, { url: 'https://api.example.com/v1', method: 'POST' })
    ).toBe(true)
    expect(
      matchesBrowserNetworkRule(scoped, { url: 'https://api.example.com/v1', method: 'GET' })
    ).toBe(false)
  })

  it('treats an empty method list as match-any', () => {
    const scoped = { ...RULE, match: { ...RULE.match, methods: [] } }
    expect(
      matchesBrowserNetworkRule(scoped, { url: 'https://api.example.com/v1', method: 'DELETE' })
    ).toBe(true)
  })

  it('filters by resource type and rejects a request that reports none', () => {
    const scoped = { ...RULE, match: { ...RULE.match, resourceTypes: ['xhr'] } }
    expect(
      matchesBrowserNetworkRule(scoped, {
        url: 'https://api.example.com/v1',
        method: 'GET',
        resourceType: 'xhr'
      })
    ).toBe(true)
    expect(
      matchesBrowserNetworkRule(scoped, {
        url: 'https://api.example.com/v1',
        method: 'GET',
        resourceType: 'image'
      })
    ).toBe(false)
    expect(
      matchesBrowserNetworkRule(scoped, { url: 'https://api.example.com/v1', method: 'GET' })
    ).toBe(false)
  })
})

describe('sanitizeBrowserNetworkRule', () => {
  it('rejects input that is not an object', () => {
    expect(sanitizeBrowserNetworkRule(null)).toBeNull()
    expect(sanitizeBrowserNetworkRule('r1')).toBeNull()
  })

  it('rejects a rule with no id or no url pattern', () => {
    expect(sanitizeBrowserNetworkRule({ match: { urlPattern: '*' } })).toBeNull()
    expect(sanitizeBrowserNetworkRule({ id: 'r1', match: { urlPattern: '  ' } })).toBeNull()
  })

  it('defaults the label to the pattern and enabled to true', () => {
    const rule = sanitizeBrowserNetworkRule({ id: 'r1', match: { urlPattern: 'https://a.com/*' } })
    expect(rule).toEqual({
      id: 'r1',
      label: 'https://a.com/*',
      enabled: true,
      match: { urlPattern: 'https://a.com/*', methods: undefined, resourceTypes: undefined },
      headers: []
    })
  })

  it('drops a set mutation with no value but keeps a remove with none', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [
        { target: 'request', op: 'set', name: 'X-A' },
        { target: 'response', op: 'remove', name: 'X-B' },
        { target: 'request', op: 'set', name: '  ', value: 'v' }
      ]
    })
    expect(rule?.headers).toEqual([{ target: 'response', op: 'remove', name: 'X-B' }])
  })

  it('drops empty strings from the method and resource-type filters', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*', methods: [' get ', ''], resourceTypes: [] }
    })
    expect(rule?.match.methods).toEqual(['get'])
    expect(rule?.match.resourceTypes).toBeUndefined()
  })

  it('drops a header name that carries a crlf', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [{ target: 'request', op: 'set', name: 'X-A\r\nInjected: yes', value: 'v' }]
    })
    expect(rule?.headers).toEqual([])
  })

  it('drops a header value that carries a newline', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [{ target: 'request', op: 'set', name: 'X-A', value: 'v\nEvil: 1' }]
    })
    expect(rule?.headers).toEqual([])
  })

  it('keeps a valid mutation next to a crlf-poisoned one', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [
        { target: 'request', op: 'set', name: 'X-A', value: 'v\r\nEvil: 1' },
        { target: 'request', op: 'remove', name: 'X-B' }
      ]
    })
    expect(rule?.headers).toEqual([{ target: 'request', op: 'remove', name: 'X-B' }])
  })

  it('drops an unrecognized op instead of coercing it to set', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [{ target: 'request', op: 'append', name: 'X-A', value: 'v' }]
    })
    expect(rule?.headers).toEqual([])
  })

  it('drops an unrecognized target instead of coercing it to request', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [{ target: 'iframe', op: 'set', name: 'X-A', value: 'v' }]
    })
    expect(rule?.headers).toEqual([])
  })

  it('defaults an absent target to request', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      headers: [{ op: 'set', name: 'X-A', value: 'v' }]
    })
    expect(rule?.headers).toEqual([{ target: 'request', op: 'set', name: 'X-A', value: 'v' }])
  })

  it('fails enabled closed for a non-boolean value', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      enabled: 'false',
      match: { urlPattern: '*' }
    })
    expect(rule?.enabled).toBe(false)
  })

  it('rejects a url pattern past the length cap', () => {
    expect(
      sanitizeBrowserNetworkRule({ id: 'r1', match: { urlPattern: '*'.repeat(2049) } })
    ).toBeNull()
    expect(
      sanitizeBrowserNetworkRule({ id: 'r1', match: { urlPattern: '*'.repeat(2048) } })?.match
        .urlPattern
    ).toHaveLength(2048)
  })

  it('keeps a response override and sanitizes its headers', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      responseOverride: {
        statusCode: 503,
        body: 'down',
        headers: [
          { target: 'response', op: 'set', name: 'X-A', value: 'v' },
          { target: 'response', op: 'set', name: 'X-B\r\nEvil: 1', value: 'v' }
        ]
      }
    })
    expect(rule?.responseOverride).toEqual({
      statusCode: 503,
      body: 'down',
      headers: [{ target: 'response', op: 'set', name: 'X-A', value: 'v' }]
    })
  })

  it('drops a response override with an out-of-range status code', () => {
    const rule = sanitizeBrowserNetworkRule({
      id: 'r1',
      match: { urlPattern: '*' },
      responseOverride: { statusCode: 999, body: 'down', headers: [] }
    })
    expect(rule?.responseOverride).toBeUndefined()
    expect(rule?.id).toBe('r1')
  })
})
