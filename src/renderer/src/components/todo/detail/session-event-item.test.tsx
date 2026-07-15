// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { i18n } from '@/i18n/i18n'
import { SessionEventItem } from './session-event-item'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

describe('SessionEventItem', () => {
  it('renders agent message text', () => {
    render(
      <SessionEventItem eventKey="agent-1" event={{ kind: 'agent_message', text: 'hello world' }} />
    )
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders a tool call with its title inside a collapsible', () => {
    render(
      <SessionEventItem
        eventKey="tool:tc1"
        event={{ kind: 'tool_call', toolCallId: 'tc1', title: 'edit file', status: 'completed' }}
      />
    )
    expect(screen.getByRole('button', { name: /edit file/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('renders a thought through the shared disclosure collapsed by default', () => {
    render(
      <SessionEventItem eventKey="thought-1" event={{ kind: 'thought', text: 'thinking...' }} />
    )
    expect(screen.getByRole('button', { name: /thought/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByText('thinking...')).not.toBeInTheDocument()
  })

  it.each([
    ['zh', '思考'],
    ['ja', '思考'],
    ['ko', '생각'],
    ['es', 'Razonamiento']
  ])('localizes the thought title in %s', async (locale, expected) => {
    await i18n.changeLanguage(locale)
    render(
      <SessionEventItem eventKey={`thought-${locale}`} event={{ kind: 'thought', text: '...' }} />
    )
    expect(screen.getByRole('button', { name: expected })).toBeInTheDocument()
  })

  it('derives running disclosure state from in-progress tool statuses', () => {
    render(
      <SessionEventItem
        eventKey="tool:tc-running"
        event={{
          kind: 'tool_call',
          toolCallId: 'tc-running',
          title: 'Bash',
          status: 'in_progress',
          rawInput: { command: 'pnpm test' }
        }}
      />
    )

    expect(screen.getByRole('button', { name: /pnpm test/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('preserves proprietary extension fallback', () => {
    render(
      <SessionEventItem
        eventKey="ext-1"
        event={{ kind: 'ext', method: 'cursor/update', params: {} }}
      />
    )
    expect(screen.getByText('cursor/update')).toBeInTheDocument()
  })
})
