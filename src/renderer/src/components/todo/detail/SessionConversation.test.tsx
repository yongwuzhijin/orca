// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SessionConversation } from './SessionConversation'

afterEach(cleanup)

const baseProps = {
  events: [{ kind: 'agent_message' as const, text: 'echo: hi' }],
  permissionRequests: [],
  status: 'complete' as const,
  mode: 'auto' as const,
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onModeChange: vi.fn(),
  onResolvePermission: vi.fn(),
  onSwitchAuto: vi.fn()
}

describe('SessionConversation', () => {
  it('renders events', () => {
    render(<SessionConversation {...baseProps} onSend={vi.fn()} />)
    expect(screen.getByText('echo: hi')).toBeInTheDocument()
  })

  it('sends a follow-up prompt when idle', () => {
    const onSend = vi.fn()
    render(<SessionConversation {...baseProps} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/follow-up/i)
    fireEvent.change(input, { target: { value: 'do more' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('do more')
  })

  it('disables send while running and shows cancel', () => {
    const onCancel = vi.fn()
    render(
      <SessionConversation {...baseProps} status="running" onSend={vi.fn()} onCancel={onCancel} />
    )
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders permission cards in ask mode', () => {
    render(
      <SessionConversation
        {...baseProps}
        onSend={vi.fn()}
        mode="ask"
        permissionRequests={[
          {
            requestId: 'r1',
            sessionId: 's1',
            options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
            toolCall: { toolCallId: 'tc1', title: 'write file', kind: 'edit' }
          }
        ]}
      />
    )
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
  })
})
