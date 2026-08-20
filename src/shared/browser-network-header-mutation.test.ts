import { describe, expect, it } from 'vitest'
import {
  applyRequestHeaderMutations,
  applyResponseHeaderMutations
} from './browser-network-header-mutation'
import type { BrowserHeaderMutation } from './browser-network-rule'

const setAuth: BrowserHeaderMutation = {
  target: 'request',
  op: 'set',
  name: 'Authorization',
  value: 'Bearer new'
}

describe('applyRequestHeaderMutations', () => {
  it('adds a header that was absent', () => {
    const headers: Record<string, string> = { Accept: '*/*' }
    applyRequestHeaderMutations(headers, [setAuth])
    expect(headers).toEqual({ Accept: '*/*', Authorization: 'Bearer new' })
  })

  it('replaces a header regardless of the casing Chromium chose', () => {
    const headers: Record<string, string> = { authorization: 'Bearer old' }
    applyRequestHeaderMutations(headers, [setAuth])
    expect(headers).toEqual({ Authorization: 'Bearer new' })
  })

  it('collapses duplicate casing variants into one canonical entry', () => {
    const headers: Record<string, string> = {
      authorization: 'Bearer old',
      Authorization: 'Bearer older'
    }
    applyRequestHeaderMutations(headers, [setAuth])
    expect(Object.keys(headers)).toEqual(['Authorization'])
    expect(headers.Authorization).toBe('Bearer new')
  })

  it('removes a header case-insensitively', () => {
    const headers: Record<string, string> = { 'X-Trace': 'abc' }
    applyRequestHeaderMutations(headers, [{ target: 'request', op: 'remove', name: 'x-trace' }])
    expect(headers).toEqual({})
  })

  it('is a no-op when removing a header that is absent', () => {
    const headers: Record<string, string> = { Accept: '*/*' }
    applyRequestHeaderMutations(headers, [{ target: 'request', op: 'remove', name: 'X-Nope' }])
    expect(headers).toEqual({ Accept: '*/*' })
  })

  it('lets the last set on the same header win', () => {
    const headers: Record<string, string> = {}
    applyRequestHeaderMutations(headers, [
      setAuth,
      { target: 'request', op: 'set', name: 'authorization', value: 'Bearer last' }
    ])
    expect(headers).toEqual({ authorization: 'Bearer last' })
  })

  it('skips a set with no value instead of writing undefined or deleting', () => {
    const headers: Record<string, string> = { Authorization: 'Bearer old' }
    applyRequestHeaderMutations(headers, [{ target: 'request', op: 'set', name: 'Authorization' }])
    expect(headers).toEqual({ Authorization: 'Bearer old' })
  })

  it('ignores mutations aimed at the response', () => {
    const headers: Record<string, string> = {}
    applyRequestHeaderMutations(headers, [
      { target: 'response', op: 'set', name: 'X-Frame-Options', value: 'DENY' }
    ])
    expect(headers).toEqual({})
  })
})

describe('applyResponseHeaderMutations', () => {
  it('writes a single-element array', () => {
    const headers: Record<string, string[]> = {}
    applyResponseHeaderMutations(headers, [
      { target: 'response', op: 'set', name: 'X-Frame-Options', value: 'DENY' }
    ])
    expect(headers).toEqual({ 'X-Frame-Options': ['DENY'] })
  })

  it('replaces a multi-value header and drops casing variants', () => {
    const headers: Record<string, string[]> = { 'set-cookie': ['a=1', 'b=2'] }
    applyResponseHeaderMutations(headers, [
      { target: 'response', op: 'set', name: 'Set-Cookie', value: 'c=3' }
    ])
    expect(headers).toEqual({ 'Set-Cookie': ['c=3'] })
  })

  it('removes a header case-insensitively', () => {
    const headers: Record<string, string[]> = { 'Content-Security-Policy': ["default-src 'self'"] }
    applyResponseHeaderMutations(headers, [
      { target: 'response', op: 'remove', name: 'content-security-policy' }
    ])
    expect(headers).toEqual({})
  })

  it('ignores mutations aimed at the request', () => {
    const headers: Record<string, string[]> = {}
    applyResponseHeaderMutations(headers, [setAuth])
    expect(headers).toEqual({})
  })
})
