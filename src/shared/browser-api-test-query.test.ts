import { describe, expect, it } from 'vitest'
import { applyBrowserApiTestQuery, splitBrowserApiTestQuery } from './browser-api-test-query'

describe('splitBrowserApiTestQuery', () => {
  it('leaves a URL with no query alone', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api')).toEqual({
      url: 'https://example.com/api',
      params: []
    })
  })

  it('moves every pair into enabled rows', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?id=1&page=2')).toEqual({
      url: 'https://example.com/api',
      params: [
        { name: 'id', value: '1', enabled: true },
        { name: 'page', value: '2', enabled: true }
      ]
    })
  })

  it('decodes percent escapes and plus-encoded spaces', () => {
    expect(
      splitBrowserApiTestQuery('https://example.com/api?q=hello+world&tag=%E4%B8%AD%E6%96%87')
    ).toEqual({
      url: 'https://example.com/api',
      params: [
        { name: 'q', value: 'hello world', enabled: true },
        { name: 'tag', value: '中文', enabled: true }
      ]
    })
  })

  it('keeps a malformed escape as typed instead of blanking it', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?q=%zz').params).toEqual([
      { name: 'q', value: '%zz', enabled: true }
    ])
  })

  it('reads a valueless pair as an empty value', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?flag').params).toEqual([
      { name: 'flag', value: '', enabled: true }
    ])
  })

  it('keeps only the first separator so a value containing = survives', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?filter=a=b').params).toEqual([
      { name: 'filter', value: 'a=b', enabled: true }
    ])
  })

  it('drops empty pairs from a trailing or doubled ampersand', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?a=1&&b=2&').params).toEqual([
      { name: 'a', value: '1', enabled: true },
      { name: 'b', value: '2', enabled: true }
    ])
  })

  it('yields no rows for a bare question mark', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?')).toEqual({
      url: 'https://example.com/api',
      params: []
    })
  })

  it('keeps the fragment on the URL and out of the params', () => {
    expect(splitBrowserApiTestQuery('https://example.com/api?a=1#frag')).toEqual({
      url: 'https://example.com/api#frag',
      params: [{ name: 'a', value: '1', enabled: true }]
    })
  })
})

describe('applyBrowserApiTestQuery', () => {
  it('returns the URL untouched when no row contributes', () => {
    expect(applyBrowserApiTestQuery('https://example.com/api', [])).toBe('https://example.com/api')
  })

  it('appends enabled rows behind a question mark', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api', [
        { name: 'id', value: '1', enabled: true },
        { name: 'page', value: '2', enabled: true }
      ])
    ).toBe('https://example.com/api?id=1&page=2')
  })

  it('skips disabled rows', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api', [
        { name: 'id', value: '1', enabled: true },
        { name: 'debug', value: 'true', enabled: false }
      ])
    ).toBe('https://example.com/api?id=1')
  })

  it('skips rows with a blank name', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api', [
        { name: '  ', value: 'orphan', enabled: true },
        { name: 'id', value: '1', enabled: true }
      ])
    ).toBe('https://example.com/api?id=1')
  })

  it('encodes names and values', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api', [
        { name: 'q', value: 'hello world&x=1', enabled: true },
        { name: 'tag', value: '中文', enabled: true }
      ])
    ).toBe('https://example.com/api?q=hello%20world%26x%3D1&tag=%E4%B8%AD%E6%96%87')
  })

  it('emits a name with an empty value', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api', [
        { name: 'flag', value: '', enabled: true }
      ])
    ).toBe('https://example.com/api?flag=')
  })

  it('joins with an ampersand when the URL already carries a query', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api?existing=1', [
        { name: 'id', value: '2', enabled: true }
      ])
    ).toBe('https://example.com/api?existing=1&id=2')
  })

  it('inserts the query ahead of the fragment', () => {
    expect(
      applyBrowserApiTestQuery('https://example.com/api#frag', [
        { name: 'id', value: '1', enabled: true }
      ])
    ).toBe('https://example.com/api?id=1#frag')
  })

  it('round-trips a split URL back to an equivalent request', () => {
    const split = splitBrowserApiTestQuery('https://example.com/api?id=1&q=hello+world#frag')
    expect(applyBrowserApiTestQuery(split.url, split.params)).toBe(
      'https://example.com/api?id=1&q=hello%20world#frag'
    )
  })
})
