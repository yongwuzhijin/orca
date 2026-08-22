import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { buildCdpFulfillPayload } from './browser-network-fulfill-payload'

describe('buildCdpFulfillPayload', () => {
  it('base64-encodes the body and carries the status code', () => {
    const payload = buildCdpFulfillPayload('req-1', {
      statusCode: 503,
      headers: [],
      body: '{"ok":false}'
    })
    expect(payload.requestId).toBe('req-1')
    expect(payload.responseCode).toBe(503)
    expect(Buffer.from(payload.body, 'base64').toString('utf8')).toBe('{"ok":false}')
  })

  it('encodes multi-byte bodies as utf8', () => {
    const payload = buildCdpFulfillPayload('req-1', {
      statusCode: 200,
      headers: [],
      body: '你好'
    })
    expect(Buffer.from(payload.body, 'base64').toString('utf8')).toBe('你好')
  })

  it('emits response set headers as a CDP name/value array', () => {
    const payload = buildCdpFulfillPayload('req-1', {
      statusCode: 200,
      headers: [{ target: 'response', op: 'set', name: 'Content-Type', value: 'application/json' }],
      body: '{}'
    })
    expect(payload.responseHeaders).toEqual([{ name: 'Content-Type', value: 'application/json' }])
  })

  it('drops request-target headers, which cannot apply to a synthesized response', () => {
    const payload = buildCdpFulfillPayload('req-1', {
      statusCode: 200,
      headers: [{ target: 'request', op: 'set', name: 'X-Debug', value: '1' }],
      body: ''
    })
    expect(payload.responseHeaders).toEqual([])
  })

  it('drops remove entries, which have nothing to remove from a synthesized response', () => {
    const payload = buildCdpFulfillPayload('req-1', {
      statusCode: 200,
      headers: [{ target: 'response', op: 'remove', name: 'X-Frame-Options' }],
      body: ''
    })
    expect(payload.responseHeaders).toEqual([])
  })

  it('writes an empty string rather than undefined for a set with no value', () => {
    const payload = buildCdpFulfillPayload('req-1', {
      statusCode: 200,
      headers: [{ target: 'response', op: 'set', name: 'X-Empty' }],
      body: ''
    })
    expect(payload.responseHeaders).toEqual([{ name: 'X-Empty', value: '' }])
  })

  it('encodes an empty body as an empty string', () => {
    expect(buildCdpFulfillPayload('req-1', { statusCode: 204, headers: [], body: '' }).body).toBe(
      ''
    )
  })
})
