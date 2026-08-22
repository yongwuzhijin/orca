import { describe, expect, it } from 'vitest'
import {
  firstBrowserApiTestHeaderValue,
  isTextualContentType,
  normalizeBrowserApiTestResponseHeaders,
  summarizeBrowserApiTestBody
} from './browser-api-test-response-body'

describe('isTextualContentType', () => {
  it('accepts text, json, xml, and form encodings', () => {
    expect(isTextualContentType('text/html; charset=utf-8')).toBe(true)
    expect(isTextualContentType('application/json')).toBe(true)
    expect(isTextualContentType('application/vnd.api+json')).toBe(true)
    expect(isTextualContentType('application/xml')).toBe(true)
    expect(isTextualContentType('image/svg+xml')).toBe(true)
    expect(isTextualContentType('application/javascript')).toBe(true)
    expect(isTextualContentType('application/x-www-form-urlencoded')).toBe(true)
  })

  it('ignores parameters, casing, and padding around the mime', () => {
    expect(isTextualContentType('application/json; charset=utf-8')).toBe(true)
    expect(isTextualContentType('Application/JSON')).toBe(true)
    expect(isTextualContentType(' application/json ; charset=utf-8')).toBe(true)
    expect(isTextualContentType('IMAGE/PNG')).toBe(false)
  })

  it('treats a missing content type as text so plain 200s still render', () => {
    expect(isTextualContentType(undefined)).toBe(true)
    expect(isTextualContentType('')).toBe(true)
  })

  it('rejects binary payloads', () => {
    expect(isTextualContentType('image/png')).toBe(false)
    expect(isTextualContentType('application/octet-stream')).toBe(false)
    expect(isTextualContentType('application/pdf')).toBe(false)
  })
})

describe('normalizeBrowserApiTestResponseHeaders', () => {
  it('wraps scalars and keeps arrays', () => {
    expect(
      normalizeBrowserApiTestResponseHeaders({
        'content-type': 'application/json',
        'set-cookie': ['a=1', 'b=2']
      })
    ).toEqual({ 'content-type': ['application/json'], 'set-cookie': ['a=1', 'b=2'] })
  })

  it('coerces non-string entries and skips undefined', () => {
    expect(
      normalizeBrowserApiTestResponseHeaders({
        age: 12 as unknown as string,
        ports: [8080, 9090] as unknown as string[],
        missing: undefined as unknown as string
      })
    ).toEqual({ age: ['12'], ports: ['8080', '9090'] })
  })

  it('preserves the casing the server sent', () => {
    expect(normalizeBrowserApiTestResponseHeaders({ 'Content-Type': 'text/plain' })).toEqual({
      'Content-Type': ['text/plain']
    })
  })

  // Why: response headers are remote-controlled, so a hostile name must stay a plain key.
  it('keeps a __proto__ header as an own key', () => {
    const normalized = normalizeBrowserApiTestResponseHeaders(
      JSON.parse('{"__proto__":["injected"]}') as Record<string, string[]>
    )
    expect(Object.keys(normalized)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(normalized)).toBeNull()
  })
})

describe('firstBrowserApiTestHeaderValue', () => {
  it('reads case-insensitively from either shape', () => {
    const headers = { 'Content-Type': 'text/plain', 'x-multi': ['one', 'two'] }
    expect(firstBrowserApiTestHeaderValue(headers, 'content-type')).toBe('text/plain')
    expect(firstBrowserApiTestHeaderValue(headers, 'X-Multi')).toBe('one')
    expect(firstBrowserApiTestHeaderValue(headers, 'absent')).toBeUndefined()
  })

  // Why: Task 4 feeds this into Number(), where the string 'undefined' becomes a NaN bodyBytes.
  it('reports an empty header array as absent rather than the string undefined', () => {
    expect(
      firstBrowserApiTestHeaderValue({ 'content-length': [] }, 'content-length')
    ).toBeUndefined()
  })
})

describe('summarizeBrowserApiTestBody', () => {
  it('decodes buffered text', () => {
    const chunks = [Buffer.from('{"ok":'), Buffer.from('true}')]
    expect(
      summarizeBrowserApiTestBody({
        chunks,
        receivedBytes: 11,
        contentLength: undefined,
        textual: true,
        capped: false
      })
    ).toEqual({ body: '{"ok":true}', bodyBytes: 11, truncated: false })
  })

  it('marks a capped body truncated but still returns what it buffered', () => {
    expect(
      summarizeBrowserApiTestBody({
        chunks: [Buffer.from('abc')],
        receivedBytes: 9_999,
        contentLength: undefined,
        textual: true,
        capped: true
      })
    ).toEqual({ body: 'abc', bodyBytes: 9_999, truncated: true })
  })

  // Why: the chunks are deliberately non-empty — an empty-chunk fixture cannot tell the binary
  // guard apart from decoding nothing, which is the whole point of the guard.
  it('withholds buffered bytes for binary payloads', () => {
    expect(
      summarizeBrowserApiTestBody({
        chunks: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
        receivedBytes: 40,
        contentLength: 2048,
        textual: false,
        capped: false
      })
    ).toEqual({ body: '', bodyBytes: 2048, truncated: false })
  })

  it('still flags truncation on a capped binary payload', () => {
    expect(
      summarizeBrowserApiTestBody({
        chunks: [Buffer.from([0x00, 0x01])],
        receivedBytes: 4_000_000,
        contentLength: undefined,
        textual: false,
        capped: true
      })
    ).toEqual({ body: '', bodyBytes: 4_000_000, truncated: true })
  })

  it('honors a zero content-length instead of falling back to observed bytes', () => {
    expect(
      summarizeBrowserApiTestBody({
        chunks: [],
        receivedBytes: 7,
        contentLength: 0,
        textual: true,
        capped: false
      }).bodyBytes
    ).toBe(0)
  })

  it('prefers content-length over the byte count it observed', () => {
    expect(
      summarizeBrowserApiTestBody({
        chunks: [Buffer.from('ab')],
        receivedBytes: 2,
        contentLength: 500,
        textual: true,
        capped: true
      }).bodyBytes
    ).toBe(500)
  })

  it('handles a multi-byte character split across chunks', () => {
    const full = Buffer.from('héllo', 'utf-8')
    const chunks = [full.subarray(0, 2), full.subarray(2)]
    expect(
      summarizeBrowserApiTestBody({
        chunks,
        receivedBytes: full.byteLength,
        contentLength: undefined,
        textual: true,
        capped: false
      }).body
    ).toBe('héllo')
  })
})
