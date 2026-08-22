// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkResponseOverride } from '../../../../../shared/browser-network-rule'
import { BrowserNetworkOverrideEditor } from './browser-network-override-editor'

afterEach(cleanup)

describe('BrowserNetworkOverrideEditor', () => {
  it('offers the toggle without any status control when no override is set', () => {
    render(<BrowserNetworkOverrideEditor override={undefined} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Override response')).toBeTruthy()
    expect(screen.queryByLabelText('Status')).toBeNull()
  })

  it('creates a json override prefilled with a content type when enabled', () => {
    const onChange = vi.fn()
    render(<BrowserNetworkOverrideEditor override={undefined} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Override response'))
    expect(onChange).toHaveBeenCalledWith({
      statusCode: 200,
      headers: [{ target: 'response', op: 'set', name: 'Content-Type', value: 'application/json' }],
      body: '{}'
    })
  })

  it('clears the override when disabled', () => {
    const onChange = vi.fn()
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 200, headers: [], body: '{}' }}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByLabelText('Override response'))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('shows the current status code and body', () => {
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 503, headers: [], body: 'down' }}
        onChange={vi.fn()}
      />
    )
    expect((screen.getByLabelText('Status') as HTMLInputElement).value).toBe('503')
    expect((screen.getByLabelText('Response body') as HTMLTextAreaElement).value).toBe('down')
  })

  it('keeps the headers and body when the status changes', () => {
    const onChange = vi.fn()
    const headers: BrowserNetworkResponseOverride['headers'] = [
      { target: 'response', op: 'set', name: 'Content-Type', value: 'application/json' }
    ]
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 200, headers, body: '{}' }}
        onChange={onChange}
      />
    )
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '404' } })
    expect(onChange).toHaveBeenCalledWith({ statusCode: 404, headers, body: '{}' })
  })

  // Why: main's sanitizer drops the whole override for a status outside 100-599 while the save
  // still reports success, so committing one here loses the user's override on the next load.
  it.each([
    { label: 'below the range', value: '99' },
    { label: 'above the range', value: '600' },
    { label: 'a partial code typed en route to a valid one', value: '5' },
    { label: 'digits with trailing junk', value: '404abc' }
  ])('keeps $label out of the saved rule while leaving it typed', ({ value }) => {
    const onChange = vi.fn()
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 200, headers: [], body: '{}' }}
        onChange={onChange}
      />
    )
    const status = screen.getByLabelText('Status') as HTMLInputElement

    fireEvent.change(status, { target: { value } })

    expect(onChange).not.toHaveBeenCalled()
    expect(status.value).toBe(value)
    expect(status.getAttribute('aria-invalid')).toBe('true')
  })

  it('commits the status once the typed digits reach a valid code', () => {
    const onChange = vi.fn()
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 200, headers: [], body: '{}' }}
        onChange={onChange}
      />
    )
    const status = screen.getByLabelText('Status')

    for (const value of ['5', '50', '503']) {
      fireEvent.change(status, { target: { value } })
    }

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ statusCode: 503, headers: [], body: '{}' })
  })

  it('edits the response body', () => {
    const onChange = vi.fn()
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 200, headers: [], body: '{}' }}
        onChange={onChange}
      />
    )
    fireEvent.change(screen.getByLabelText('Response body'), { target: { value: '{"a":1}' } })
    expect(onChange).toHaveBeenCalledWith({ statusCode: 200, headers: [], body: '{"a":1}' })
  })
})
