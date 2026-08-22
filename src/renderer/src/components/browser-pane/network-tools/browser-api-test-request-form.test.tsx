// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { BrowserApiTestHeader } from '../../../../../shared/browser-api-test-types'

vi.mock('@/components/json-formatter/JsonFormatterInput', () => ({
  JsonFormatterInput: ({
    value,
    onChange,
    readOnly,
    language
  }: {
    value: string
    onChange?: (next: string) => void
    readOnly?: boolean
    language?: string
  }) => (
    <textarea
      data-testid="body-editor"
      data-readonly={String(readOnly === true)}
      data-language={String(language)}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  )
}))

vi.mock('./browser-api-test-header-rows', () => ({
  BrowserApiTestHeaderRows: ({
    rows,
    onChange
  }: {
    rows: BrowserApiTestHeader[]
    onChange: (next: BrowserApiTestHeader[]) => void
  }) => (
    <button
      type="button"
      data-testid="header-rows"
      onClick={() => onChange([...rows, { name: 'x', value: 'y', enabled: true }])}
    >
      {rows.map((row) => row.name).join(',')}
    </button>
  )
}))

import { BrowserApiTestRequestForm } from './browser-api-test-request-form'

// Why: this suite family does not load jest-dom, so there is no auto-cleanup between cases.
afterEach(cleanup)

function renderForm(overrides: Partial<Parameters<typeof BrowserApiTestRequestForm>[0]> = {}): {
  onMethodChange: ReturnType<typeof vi.fn>
  onUrlChange: ReturnType<typeof vi.fn>
  onHeadersChange: ReturnType<typeof vi.fn>
  onBodyChange: ReturnType<typeof vi.fn>
} {
  const handlers = {
    onMethodChange: vi.fn(),
    onUrlChange: vi.fn(),
    onHeadersChange: vi.fn(),
    onBodyChange: vi.fn()
  }
  render(
    <BrowserApiTestRequestForm
      method="GET"
      url="https://example.com/api"
      headers={[{ name: 'accept', value: '*/*', enabled: true }]}
      body=""
      {...handlers}
      {...overrides}
    />
  )
  return handlers
}

describe('BrowserApiTestRequestForm', () => {
  it('shows the current method and url', () => {
    renderForm()

    expect((screen.getByLabelText('Method') as HTMLSelectElement).value).toBe('GET')
    expect((screen.getByLabelText('Request URL') as HTMLInputElement).value).toBe(
      'https://example.com/api'
    )
  })

  it('offers every supported method exactly once', () => {
    renderForm()

    const options = Array.from(screen.getByLabelText('Method').querySelectorAll('option')).map(
      (option) => option.getAttribute('value')
    )
    expect(options).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
  })

  it('reports a method change', () => {
    const { onMethodChange } = renderForm()

    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'POST' } })

    expect(onMethodChange).toHaveBeenCalledWith('POST')
  })

  it('reports a url change', () => {
    const { onUrlChange } = renderForm()

    fireEvent.change(screen.getByLabelText('Request URL'), {
      target: { value: 'https://example.com/next' }
    })

    expect(onUrlChange).toHaveBeenCalledWith('https://example.com/next')
  })

  it('passes the header rows through and forwards their edits', () => {
    const { onHeadersChange } = renderForm()

    expect(screen.getByTestId('header-rows').textContent).toBe('accept')
    fireEvent.click(screen.getByTestId('header-rows'))

    expect(onHeadersChange).toHaveBeenCalledWith([
      { name: 'accept', value: '*/*', enabled: true },
      { name: 'x', value: 'y', enabled: true }
    ])
  })

  it.each(['GET', 'HEAD'])('hides the body editor for %s, which carries no body', (method) => {
    renderForm({ method })

    expect(screen.queryByTestId('body-editor')).toBeNull()
  })

  it('shows the body editor for a method that carries a body and forwards edits', () => {
    const { onBodyChange } = renderForm({ method: 'POST', body: '{"a":1}' })

    const editor = screen.getByTestId('body-editor') as HTMLTextAreaElement
    expect(editor.value).toBe('{"a":1}')
    fireEvent.change(editor, { target: { value: '{"a":2}' } })

    expect(onBodyChange).toHaveBeenCalledWith('{"a":2}')
  })

  // Why: the response viewer shares this editor in read-only plaintext mode, and inheriting either
  // of those settings here would make the request body unwritable or lose its JSON squiggles.
  it('keeps the request body editable and JSON-aware', () => {
    renderForm({ method: 'POST', body: '{}' })

    const editor = screen.getByTestId('body-editor')

    expect(editor.getAttribute('data-readonly')).toBe('false')
    expect(editor.getAttribute('data-language')).toBe('undefined')
  })

  it('normalizes a lowercase method before deciding whether a body applies', () => {
    renderForm({ method: 'post', body: 'x' })

    expect(screen.getByTestId('body-editor')).not.toBeNull()
    expect((screen.getByLabelText('Method') as HTMLSelectElement).value).toBe('POST')
  })

  // Why: the prefill from a log entry is an arbitrary wire string, and a <select> cannot show a
  // value that is not one of its options — it would silently fall back to the first one anyway.
  it('falls back to GET when the method is not one this client can send', () => {
    renderForm({ method: 'BREW', body: 'x' })

    expect((screen.getByLabelText('Method') as HTMLSelectElement).value).toBe('GET')
    expect(screen.queryByTestId('body-editor')).toBeNull()
  })
})
