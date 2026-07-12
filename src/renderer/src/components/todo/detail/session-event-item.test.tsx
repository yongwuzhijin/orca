// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SessionEventItem } from './session-event-item'

afterEach(cleanup)

describe('SessionEventItem', () => {
  it('renders agent message text', () => {
    render(<SessionEventItem event={{ kind: 'agent_message', text: 'hello world' }} />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders a tool call with its title inside a collapsible', () => {
    render(
      <SessionEventItem
        event={{ kind: 'tool_call', toolCallId: 'tc1', title: 'edit file', status: 'completed' }}
      />
    )
    expect(screen.getByText('edit file')).toBeInTheDocument()
  })

  it('renders a thought as collapsible summary', () => {
    render(<SessionEventItem event={{ kind: 'thought', text: 'thinking...' }} />)
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  })
})
