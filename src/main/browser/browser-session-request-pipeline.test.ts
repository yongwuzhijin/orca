import type { Session } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearBrowserSessionRequestPipeline,
  installBrowserSessionRequestPipeline,
  setBrowserBeforeRequestStage,
  setBrowserCompletedStage,
  setBrowserErrorStage,
  setBrowserRequestHeadersStage,
  setBrowserResponseHeadersStage
} from './browser-session-request-pipeline'

type Captured = {
  beforeRequest?: (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void
  ) => void
  requestHeaders?: (
    details: Electron.OnBeforeSendHeadersListenerDetails,
    callback: (response: Electron.BeforeSendResponse) => void
  ) => void
  responseHeaders?: (
    details: Electron.OnHeadersReceivedListenerDetails,
    callback: (response: Electron.HeadersReceivedResponse) => void
  ) => void
  completed?: (details: Electron.OnCompletedListenerDetails) => void
  errored?: (details: Electron.OnErrorOccurredListenerDetails) => void
}

function createFakeSession(): { sess: Session; captured: Captured; nulls: string[] } {
  const captured: Captured = {}
  const nulls: string[] = []
  const record = <K extends keyof Captured>(key: K, name: string) => {
    return (listener: Captured[K] | null): void => {
      if (listener === null) {
        nulls.push(name)
        return
      }
      captured[key] = listener
    }
  }
  const sess = {
    webRequest: {
      onBeforeRequest: record('beforeRequest', 'onBeforeRequest'),
      onBeforeSendHeaders: record('requestHeaders', 'onBeforeSendHeaders'),
      onHeadersReceived: record('responseHeaders', 'onHeadersReceived'),
      onCompleted: record('completed', 'onCompleted'),
      onErrorOccurred: record('errored', 'onErrorOccurred')
    }
  }
  return { sess: sess as unknown as Session, captured, nulls }
}

const beforeRequestDetails = (url = 'https://a.com/x') =>
  ({
    id: 1,
    url,
    method: 'GET',
    resourceType: 'xhr',
    timestamp: 0
  }) as Electron.OnBeforeRequestListenerDetails

const sendHeadersDetails = (requestHeaders: Record<string, string>) =>
  ({
    id: 2,
    url: 'https://a.com/x',
    method: 'GET',
    resourceType: 'xhr',
    timestamp: 0,
    requestHeaders
  }) as Electron.OnBeforeSendHeadersListenerDetails

const headersReceivedDetails = (responseHeaders?: Record<string, string[]>) =>
  ({
    id: 3,
    url: 'https://a.com/x',
    method: 'GET',
    resourceType: 'xhr',
    timestamp: 0,
    statusCode: 200,
    statusLine: 'HTTP/1.1 200 OK',
    responseHeaders
  }) as Electron.OnHeadersReceivedListenerDetails

describe('browser session request pipeline', () => {
  let fake: ReturnType<typeof createFakeSession>

  beforeEach(() => {
    fake = createFakeSession()
    installBrowserSessionRequestPipeline(fake.sess)
  })

  it('registers each webRequest listener exactly once even when installed twice', () => {
    const first = fake.captured.requestHeaders
    installBrowserSessionRequestPipeline(fake.sess)
    expect(fake.captured.requestHeaders).toBe(first)
  })

  it('runs request-header stages in STAGE_ORDER, not registration order', () => {
    const seen: string[] = []
    setBrowserRequestHeadersStage(fake.sess, 'request-log', () => {
      seen.push('request-log')
    })
    setBrowserRequestHeadersStage(fake.sess, 'client-hints', () => {
      seen.push('client-hints')
    })
    setBrowserRequestHeadersStage(fake.sess, 'network-rules', () => {
      seen.push('network-rules')
    })
    const callback = vi.fn()
    fake.captured.requestHeaders?.(sendHeadersDetails({}), callback)
    expect(seen).toEqual(['client-hints', 'network-rules', 'request-log'])
  })

  it('hands every stage the same mutable header object and returns it once', () => {
    setBrowserRequestHeadersStage(fake.sess, 'client-hints', (_details, headers) => {
      headers['X-One'] = '1'
    })
    setBrowserRequestHeadersStage(fake.sess, 'network-rules', (_details, headers) => {
      headers['X-Two'] = headers['X-One'] === '1' ? '2' : 'missing'
    })
    const callback = vi.fn()
    fake.captured.requestHeaders?.(sendHeadersDetails({ Accept: '*/*' }), callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: { Accept: '*/*', 'X-One': '1', 'X-Two': '2' }
    })
  })

  it('replaces a stage by key and keeps its siblings', () => {
    const seen: string[] = []
    setBrowserRequestHeadersStage(fake.sess, 'client-hints', () => {
      seen.push('old-hints')
    })
    setBrowserRequestHeadersStage(fake.sess, 'network-rules', () => {
      seen.push('rules')
    })
    setBrowserRequestHeadersStage(fake.sess, 'client-hints', () => {
      seen.push('new-hints')
    })
    fake.captured.requestHeaders?.(sendHeadersDetails({}), vi.fn())
    expect(seen).toEqual(['new-hints', 'rules'])
  })

  it('removes a stage when null is passed', () => {
    const stage = vi.fn()
    const callback = vi.fn()
    setBrowserRequestHeadersStage(fake.sess, 'network-rules', stage)
    setBrowserRequestHeadersStage(fake.sess, 'network-rules', null)
    fake.captured.requestHeaders?.(sendHeadersDetails({}), callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(stage).not.toHaveBeenCalled()
  })

  it('still answers the callback exactly once when no stages are registered', () => {
    const callback = vi.fn()
    fake.captured.requestHeaders?.(sendHeadersDetails({ Accept: '*/*' }), callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ requestHeaders: { Accept: '*/*' } })
  })

  it('keeps calling later stages and the callback when a stage throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    setBrowserRequestHeadersStage(fake.sess, 'client-hints', () => {
      throw new Error('boom')
    })
    try {
      const later = vi.fn()
      setBrowserRequestHeadersStage(fake.sess, 'network-rules', later)
      const callback = vi.fn()
      fake.captured.requestHeaders?.(sendHeadersDetails({}), callback)
      expect(later).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('short-circuits onBeforeRequest as soon as a stage cancels', () => {
    setBrowserBeforeRequestStage(fake.sess, 'certificate-guard', () => ({ cancel: true }))
    const later = vi.fn()
    setBrowserBeforeRequestStage(fake.sess, 'network-rules', later)
    const callback = vi.fn()
    fake.captured.beforeRequest?.(beforeRequestDetails(), callback)
    expect(later).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith({ cancel: true })
  })

  it('allows an uncancelled onBeforeRequest through with an empty response', () => {
    setBrowserBeforeRequestStage(fake.sess, 'certificate-guard', () => undefined)
    const callback = vi.fn()
    fake.captured.beforeRequest?.(beforeRequestDetails(), callback)
    expect(callback).toHaveBeenCalledWith({})
  })

  it('passes response headers through the stages', () => {
    setBrowserResponseHeadersStage(fake.sess, 'network-rules', (_details, headers) => {
      delete headers['content-security-policy']
    })
    const callback = vi.fn()
    fake.captured.responseHeaders?.(
      headersReceivedDetails({
        'content-security-policy': ["default-src 'self'"],
        Server: ['nginx']
      }),
      callback
    )
    expect(callback).toHaveBeenCalledWith({ responseHeaders: { Server: ['nginx'] } })
  })

  it('hands response-header stages a draft and leaves details.responseHeaders untouched', () => {
    setBrowserResponseHeadersStage(fake.sess, 'network-rules', (_details, headers) => {
      delete headers['content-security-policy']
    })
    const details = headersReceivedDetails({ 'content-security-policy': ["default-src 'self'"] })
    fake.captured.responseHeaders?.(details, vi.fn())
    expect(details.responseHeaders).toEqual({ 'content-security-policy': ["default-src 'self'"] })
  })

  it('does not invent response headers when the response carried none', () => {
    const callback = vi.fn()
    fake.captured.responseHeaders?.(headersReceivedDetails(undefined), callback)
    expect(callback).toHaveBeenCalledWith({})
  })

  it('dispatches completion and error events', () => {
    const completed = vi.fn()
    const errored = vi.fn()
    setBrowserCompletedStage(fake.sess, 'request-log', completed)
    setBrowserErrorStage(fake.sess, 'request-log', errored)
    fake.captured.completed?.({ id: 4 } as Electron.OnCompletedListenerDetails)
    fake.captured.errored?.({ id: 5, error: 'net::ERR' } as Electron.OnErrorOccurredListenerDetails)
    expect(completed).toHaveBeenCalledTimes(1)
    expect(errored).toHaveBeenCalledTimes(1)
  })

  it('installs the pipeline on demand when a stage is set first', () => {
    const bare = createFakeSession()
    setBrowserRequestHeadersStage(bare.sess, 'client-hints', (_details, headers) => {
      headers['X-Late'] = 'yes'
    })
    const callback = vi.fn()
    bare.captured.requestHeaders?.(sendHeadersDetails({}), callback)
    expect(callback).toHaveBeenCalledWith({ requestHeaders: { 'X-Late': 'yes' } })
  })

  it('detaches every listener and forgets the stages on clear', () => {
    const stage = vi.fn()
    setBrowserRequestHeadersStage(fake.sess, 'network-rules', stage)
    clearBrowserSessionRequestPipeline(fake.sess)
    expect(fake.nulls).toEqual([
      'onBeforeRequest',
      'onBeforeSendHeaders',
      'onHeadersReceived',
      'onCompleted',
      'onErrorOccurred'
    ])
    installBrowserSessionRequestPipeline(fake.sess)
    fake.captured.requestHeaders?.(sendHeadersDetails({}), vi.fn())
    expect(stage).not.toHaveBeenCalled()
  })
})
