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

  it('ignores a non-numeric status rather than writing NaN', () => {
    const onChange = vi.fn()
    render(
      <BrowserNetworkOverrideEditor
        override={{ statusCode: 200, headers: [], body: '{}' }}
        onChange={onChange}
      />
    )
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'abc' } })
    expect(onChange).not.toHaveBeenCalled()
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
