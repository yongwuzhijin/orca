import { describe, expect, it } from 'vitest'
import {
  browserApiTestHeaderRowsFromRecord,
  browserApiTestMethodAllowsBody,
  buildBrowserApiTestHeaderRecord,
  normalizeBrowserApiTestMethod,
  resolveBrowserApiTestTarget
} from './browser-api-test-target'

describe('resolveBrowserApiTestTarget', () => {
  it('accepts http and https', () => {
    expect(resolveBrowserApiTestTarget('https://example.com/a?b=1')).toEqual({
      url: 'https://example.com/a?b=1',
      protocol: 'https:'
    })
    expect(resolveBrowserApiTestTarget('http://example.com/')?.protocol).toBe('http:')
  })

  it('accepts loopback and custom ports', () => {
    expect(resolveBrowserApiTestTarget('http://127.0.0.1:5173/api/me')?.url).toBe(
      'http://127.0.0.1:5173/api/me'
    )
    expect(resolveBrowserApiTestTarget('http://localhost:3000/x')?.protocol).toBe('http:')
  })

  it('trims surrounding whitespace', () => {
    expect(resolveBrowserApiTestTarget('  https://example.com/  ')?.url).toBe(
      'https://example.com/'
    )
  })

  // Why: new URL() already strips ASCII spaces, so only non-ASCII whitespace (a paste from chat)
  // proves the trim() is doing anything.
  it('trims non-ASCII whitespace the URL parser would reject', () => {
    expect(resolveBrowserApiTestTarget(' https://example.com/ ')?.url).toBe('https://example.com/')
    expect(resolveBrowserApiTestTarget('　https://example.com/')?.url).toBe('https://example.com/')
  })

  it('returns the canonical form the sender will use', () => {
    expect(resolveBrowserApiTestTarget('HTTPS://EXAMPLE.com')?.url).toBe('https://example.com/')
  })

  it('refuses non-http schemes, relative input, and blanks', () => {
    expect(resolveBrowserApiTestTarget('file:///etc/passwd')).toBeNull()
    expect(resolveBrowserApiTestTarget('orca://internal')).toBeNull()
    expect(resolveBrowserApiTestTarget('ws://example.com')).toBeNull()
    expect(resolveBrowserApiTestTarget('/api/me')).toBeNull()
    expect(resolveBrowserApiTestTarget('   ')).toBeNull()
  })
})

describe('normalizeBrowserApiTestMethod', () => {
  it('upper-cases and trims known methods', () => {
    expect(normalizeBrowserApiTestMethod(' post ')).toBe('POST')
    expect(normalizeBrowserApiTestMethod('get')).toBe('GET')
  })

  it('rejects unknown verbs', () => {
    expect(normalizeBrowserApiTestMethod('TRACE')).toBeNull()
    expect(normalizeBrowserApiTestMethod('')).toBeNull()
  })
})

describe('browserApiTestMethodAllowsBody', () => {
  it('excludes GET and HEAD', () => {
    expect(browserApiTestMethodAllowsBody('GET')).toBe(false)
    expect(browserApiTestMethodAllowsBody('HEAD')).toBe(false)
    expect(browserApiTestMethodAllowsBody('POST')).toBe(true)
    expect(browserApiTestMethodAllowsBody('DELETE')).toBe(true)
  })
})

describe('buildBrowserApiTestHeaderRecord', () => {
  it('keeps enabled rows and trims names', () => {
    expect(
      buildBrowserApiTestHeaderRecord([
        { name: ' X-Token ', value: 'abc', enabled: true },
        { name: 'Accept', value: 'application/json', enabled: true }
      ])
    ).toEqual({ 'X-Token': 'abc', Accept: 'application/json' })
  })

  it('drops disabled rows, blank names, and connection-level headers', () => {
    expect(
      buildBrowserApiTestHeaderRecord([
        { name: 'X-Off', value: 'v', enabled: false },
        { name: '   ', value: 'v', enabled: true },
        { name: 'Content-Length', value: '9', enabled: true },
        { name: 'host', value: 'evil.example', enabled: true },
        { name: 'Connection', value: 'close', enabled: true },
        { name: 'Transfer-Encoding', value: 'chunked', enabled: true }
      ])
    ).toEqual({})
  })

  it('keeps the last row when a name repeats', () => {
    expect(
      buildBrowserApiTestHeaderRecord([
        { name: 'X-A', value: 'first', enabled: true },
        { name: 'X-A', value: 'second', enabled: true }
      ])
    ).toEqual({ 'X-A': 'second' })
  })
})

describe('browserApiTestHeaderRowsFromRecord', () => {
  it('turns a recorded header map into enabled editable rows', () => {
    expect(
      browserApiTestHeaderRowsFromRecord({ Accept: 'application/json', 'X-Trace': '7' })
    ).toEqual([
      { name: 'Accept', value: 'application/json', enabled: true },
      { name: 'X-Trace', value: '7', enabled: true }
    ])
  })

  // Why: net.request owns these, and buildBrowserApiTestHeaderRecord drops them anyway —
  // seeding them into the editor would only give the user rows to delete.
  it('drops connection-level headers regardless of case', () => {
    expect(
      browserApiTestHeaderRowsFromRecord({
        Host: 'example.com',
        'Content-Length': '12',
        CONNECTION: 'keep-alive',
        'transfer-encoding': 'chunked',
        accept: '*/*'
      })
    ).toEqual([{ name: 'accept', value: '*/*', enabled: true }])
  })

  it('returns no rows for an absent record', () => {
    expect(browserApiTestHeaderRowsFromRecord(undefined)).toEqual([])
  })

  // Why: seeding a logged request and sending it unedited is the whole point of the log button,
  // so the two directions have to agree on which names survive.
  it('round-trips a logged request back to the same header record', () => {
    const logged = { Accept: 'application/json', Host: 'example.com', 'X-Trace': '7' }
    expect(buildBrowserApiTestHeaderRecord(browserApiTestHeaderRowsFromRecord(logged))).toEqual({
      Accept: 'application/json',
      'X-Trace': '7'
    })
  })
})
