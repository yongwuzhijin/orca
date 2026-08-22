// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  BrowserApiTestFailureReason,
  BrowserApiTestResponse
} from '../../../../../shared/browser-api-test-types'

vi.mock('@/components/json-formatter/JsonFormatterInput', () => ({
  JsonFormatterInput: ({
    value,
    readOnly,
    language
  }: {
    value: string
    readOnly?: boolean
    language?: string
  }) => (
    <div
      data-testid="body-editor"
      data-readonly={String(readOnly === true)}
      data-language={language}
    >
      {value}
    </div>
  )
}))

vi.mock('@/components/native-chat/NativeChatCopyButton', () => ({
  NativeChatCopyButton: ({ text, label }: { text: string; label?: string }) => (
    <button type="button" aria-label={label} data-copy={text} />
  )
}))

import { BrowserApiTestResponseView } from './browser-api-test-response-view'

const okResponse: BrowserApiTestResponse = {
  status: 'ok',
  statusCode: 200,
  statusMessage: 'OK',
  headers: { 'content-type': ['application/json'], 'set-cookie': ['a=1', 'b=2'] },
  body: '{"ok":true}',
  bodyBytes: 11,
  truncated: false,
  textual: true,
  durationMs: 42
}

describe('BrowserApiTestResponseView', () => {
  // Why: this suite family does not load jest-dom, so there is no auto-cleanup between cases.
  afterEach(cleanup)

  it('renders nothing before the first response', () => {
    const { container } = render(<BrowserApiTestResponseView response={null} />)

    expect(container.textContent).toBe('')
  })

  it('shows the status code, status message, and duration', () => {
    const { container } = render(<BrowserApiTestResponseView response={okResponse} />)

    // Why: rendering both the code and the message proves nothing about which one carries the tint.
    expect(container.querySelector('.text-status-success')?.textContent).toBe('200')
    expect(screen.getByText('OK')).toBeTruthy()
    expect(screen.getByText('42 ms')).toBeTruthy()
  })

  it('tints a 2xx status as success and a 5xx status as destructive', () => {
    const { container } = render(<BrowserApiTestResponseView response={okResponse} />)
    expect(container.querySelector('.text-status-success')).toBeTruthy()

    cleanup()
    const failing = render(
      <BrowserApiTestResponseView
        response={{ ...okResponse, statusCode: 503, statusMessage: 'Service Unavailable' }}
      />
    )
    expect(failing.container.querySelector('.text-destructive')).toBeTruthy()
  })

  it('tints a 4xx status as a warning', () => {
    const { container } = render(
      <BrowserApiTestResponseView
        response={{ ...okResponse, statusCode: 404, statusMessage: 'Not Found' }}
      />
    )

    expect(container.querySelector('.text-amber-600')).toBeTruthy()
  })

  // Why: only 2xx is green, so both edges of that range have to be pinned — without the upper
  // bound a redirect reads as success, and without the lower bound so does an informational reply.
  it.each([100, 302])('leaves a %i status untinted', (statusCode) => {
    const { container } = render(
      <BrowserApiTestResponseView
        response={{ ...okResponse, statusCode, statusMessage: 'Other' }}
      />
    )

    expect(container.querySelector('.text-status-success')).toBeNull()
    expect(container.querySelector('.text-amber-600')).toBeNull()
    expect(container.querySelector('.text-destructive')).toBeNull()
  })

  it('lists every response header, one line per duplicate value', () => {
    render(<BrowserApiTestResponseView response={okResponse} />)

    expect(screen.getByText('content-type')).toBeTruthy()
    expect(screen.getByText('application/json')).toBeTruthy()
    expect(screen.getAllByText('set-cookie')).toHaveLength(2)
    expect(screen.getByText('a=1')).toBeTruthy()
    expect(screen.getByText('b=2')).toBeTruthy()
  })

  // Why: rendering both halves of a header proves nothing about which half is which.
  it('puts the header name before its value on each line', () => {
    render(<BrowserApiTestResponseView response={okResponse} />)

    expect(screen.getByText('content-type').parentElement?.textContent).toBe(
      'content-typeapplication/json'
    )
  })

  it('renders the body in a read-only plaintext editor', () => {
    render(<BrowserApiTestResponseView response={okResponse} />)

    const editor = screen.getByTestId('body-editor')

    expect(editor.textContent).toBe('{"ok":true}')
    expect(editor.getAttribute('data-readonly')).toBe('true')
    // Why: an arbitrary response body would get bogus JSON squiggles under the default language.
    expect(editor.getAttribute('data-language')).toBe('plaintext')
  })

  it('offers a copy button wired to the body text', () => {
    render(<BrowserApiTestResponseView response={okResponse} />)

    const copy = screen.getByLabelText('Copy response body')

    expect(copy.getAttribute('data-copy')).toBe('{"ok":true}')
  })

  it('warns when the body was capped', () => {
    render(
      <BrowserApiTestResponseView
        response={{ ...okResponse, truncated: true, bodyBytes: 5_000_000 }}
      />
    )

    const notice = screen.getByText(/truncated/i)

    expect(notice.textContent).toMatch(/5[,.\s]?000[,.\s]?000/)
  })

  // Why: a notice that always renders is indistinguishable from one that renders when asked.
  it('stays quiet about truncation when the whole body arrived', () => {
    render(<BrowserApiTestResponseView response={okResponse} />)

    expect(screen.queryByText(/truncated/i)).toBeNull()
  })

  it('reports a non-textual body by size instead of rendering it', () => {
    render(
      <BrowserApiTestResponseView
        response={{ ...okResponse, textual: false, body: '', bodyBytes: 2048 }}
      />
    )

    expect(screen.queryByTestId('body-editor')).toBeNull()
    expect(screen.getByText(/2048 bytes/)).toBeTruthy()
    // Why: copying an empty string is a dead affordance.
    expect(screen.queryByLabelText('Copy response body')).toBeNull()
  })

  it('renders a transport failure with its diagnostic detail and no body editor', () => {
    const { container } = render(
      <BrowserApiTestResponseView
        response={{
          status: 'error',
          reason: 'timeout',
          message: 'net::ERR_TIMED_OUT',
          durationMs: 30_000
        }}
      />
    )

    expect(screen.getByText('Request timed out after 30 seconds.')).toBeTruthy()
    expect(screen.getByText('net::ERR_TIMED_OUT')).toBeTruthy()
    expect(screen.getByText(/30[,.\s]?000 ms/)).toBeTruthy()
    expect(container.querySelector('.text-destructive')).toBeTruthy()
    expect(screen.queryByTestId('body-editor')).toBeNull()
  })

  // Why: the main process ships English diagnostics, so every reason needs its own localized line.
  it('gives each failure reason its own localized headline', () => {
    const expected: Record<BrowserApiTestFailureReason, string> = {
      invalid_url: 'Enter an http or https URL.',
      invalid_method: 'That HTTP method is not supported.',
      no_guest: 'This tab has no live page to borrow a session from.',
      busy: 'A request is already in flight for this tab.',
      timeout: 'Request timed out after 30 seconds.',
      aborted: 'Request canceled.',
      network: 'The request could not be completed.'
    }

    for (const [reason, headline] of Object.entries(expected)) {
      render(
        <BrowserApiTestResponseView
          response={{
            status: 'error',
            reason: reason as BrowserApiTestFailureReason,
            message: 'diagnostic',
            durationMs: 1
          }}
        />
      )

      expect(screen.getByText(headline)).toBeTruthy()
      cleanup()
    }
  })

  it('omits the diagnostic line when the main process had nothing to add', () => {
    const { container } = render(
      <BrowserApiTestResponseView
        response={{ status: 'error', reason: 'aborted', message: '', durationMs: 12 }}
      />
    )

    expect(screen.getByText('Request canceled.')).toBeTruthy()
    expect(screen.getByText('12 ms')).toBeTruthy()
    // Why: an empty diagnostic paragraph is invisible to a text query but still occupies a row.
    expect(container.querySelector('.font-mono')).toBeNull()
  })
})
