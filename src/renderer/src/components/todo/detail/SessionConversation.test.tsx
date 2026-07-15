// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { i18n } from '@/i18n/i18n'
import { SessionConversation } from './SessionConversation'
import * as AcpToolPresentationModule from './acp-tool-presentation'

vi.mock('./acp-tool-presentation', async (importOriginal) => {
  const actual = await importOriginal<typeof AcpToolPresentationModule>()
  return { ...actual, presentAcpToolCall: vi.fn(actual.presentAcpToolCall) }
})

afterEach(async () => {
  cleanup()
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
})

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
    expect(screen.getByTestId('session-composer')).toHaveClass('shrink-0', 'border-border')
  })

  // Why: long unbreakable agent/tool text must not expand the column past the
  // overflow-hidden detail pane, or the composer send/stop control is clipped.
  it('constrains the conversation column so composer actions stay visible', () => {
    const { container } = render(<SessionConversation {...baseProps} onSend={vi.fn()} />)
    expect(container.firstChild).toHaveClass('min-w-0', 'w-full')
    expect(screen.getByRole('button', { name: /send/i })).toBeVisible()
  })

  // Why: overflow-y-auto alone computes overflow-x to auto; above 600px the
  // transcript should wrap instead of showing a horizontal scrollbar.
  it('hides horizontal overflow in the transcript once the pane is wider than 600px', () => {
    render(
      <SessionConversation
        {...baseProps}
        events={[
          {
            kind: 'agent_message',
            text: `${'very-long-path/'.repeat(40)}file.ts`
          }
        ]}
        onSend={vi.fn()}
      />
    )
    const conversation = screen.getByTestId('session-conversation')
    const transcript = screen.getByTestId('session-transcript')
    expect(conversation).toHaveClass('@container/session-conversation')
    expect(transcript).toHaveClass(
      'overflow-y-auto',
      'overflow-x-auto',
      '@[600px]/session-conversation:overflow-x-hidden'
    )
    expect(screen.getByText(/very-long-path/)).toHaveClass(
      'break-words',
      '[overflow-wrap:anywhere]'
    )
  })

  it('renders one engine-neutral timeline for mixed ACP events', () => {
    render(
      <SessionConversation
        {...baseProps}
        events={[
          { kind: 'user_message', text: 'Implement the session UI' },
          { kind: 'thought', text: 'Inspecting ' },
          { kind: 'thought', text: 'the timeline' },
          {
            kind: 'tool_call',
            toolCallId: 'bash-1',
            title: 'Bash',
            status: 'pending',
            rawInput: { command: 'pnpm test' }
          },
          {
            kind: 'tool_call',
            toolCallId: 'bash-1',
            title: 'Bash',
            status: 'completed',
            content: { output: 'PASS' }
          },
          {
            kind: 'tool_call',
            toolCallId: 'edit-1',
            title: 'Edit',
            status: 'completed',
            rawInput: {
              path: 'src/session.ts',
              old_string: 'old',
              new_string: 'new\nline'
            }
          },
          {
            kind: 'tool_call',
            toolCallId: 'agent-1',
            title: 'Subagent',
            status: 'running',
            toolKind: 'task',
            rawInput: {
              description: 'Verify ACP UI',
              model: 'GPT-5.6 Sol'
            }
          },
          {
            kind: 'tool_call',
            toolCallId: 'agent-1',
            title: 'Subagent',
            status: 'completed',
            content: { result: 'All focused tests passed' }
          }
        ]}
        onSend={vi.fn()}
      />
    )

    expect(screen.getByText('Implement the session UI')).toBeVisible()
    expect(screen.getAllByRole('button', { name: /thought/i })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /thought/i }))
    expect(screen.getByText('Inspecting the timeline')).toBeVisible()

    const bashTrigger = screen.getByRole('button', { name: /pnpm test.*completed/i })
    expect(screen.getAllByText('pnpm test')).toHaveLength(1)
    expect(bashTrigger).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: /src\/session\.ts.*changes.*\+2.*-1/i })
    ).toBeInTheDocument()

    const subagentTrigger = screen.getByRole('button', {
      name: /Verify ACP UI.*GPT-5\.6 Sol.*completed/i
    })
    expect(screen.getAllByText('Verify ACP UI')).toHaveLength(1)
    fireEvent.click(subagentTrigger)
    expect(screen.getByLabelText('Subagent result')).toHaveTextContent('All focused tests passed')
  })

  it('preserves an expanded streaming thought when its stable event key does not change', () => {
    const { rerender } = render(
      <SessionConversation
        {...baseProps}
        events={[{ kind: 'thought', text: 'Analyzing' }]}
        onSend={vi.fn()}
      />
    )
    const trigger = screen.getByRole('button', { name: /thought/i })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    rerender(
      <SessionConversation
        {...baseProps}
        events={[{ kind: 'thought', text: 'Analyzing repository' }]}
        onSend={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /thought/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('Analyzing repository')).toBeVisible()
  })

  it('does not reparse stable tool events for draft changes but refreshes updated events', () => {
    const toolEvent = {
      kind: 'tool_call' as const,
      toolCallId: 'bash-memo-1',
      title: 'Bash',
      status: 'completed',
      rawInput: { command: 'pnpm test' },
      content: { output: 'PASS' }
    }
    const { rerender } = render(
      <SessionConversation {...baseProps} events={[toolEvent]} onSend={vi.fn()} />
    )
    expect(AcpToolPresentationModule.presentAcpToolCall).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByPlaceholderText(/follow-up/i), { target: { value: 'continue' } })
    expect(AcpToolPresentationModule.presentAcpToolCall).toHaveBeenCalledTimes(1)

    rerender(
      <SessionConversation
        {...baseProps}
        events={[{ ...toolEvent, content: { output: 'UPDATED' } }]}
        onSend={vi.fn()}
      />
    )
    expect(AcpToolPresentationModule.presentAcpToolCall).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: /pnpm test.*completed/i }))
    expect(screen.getByLabelText('Command output')).toHaveTextContent('UPDATED')
  })

  it('refreshes localized tool labels without reparsing a stable event', async () => {
    const toolEvent = {
      kind: 'tool_call' as const,
      toolCallId: 'bash-locale-1',
      title: 'Bash',
      status: 'completed',
      rawInput: { command: 'pnpm test' }
    }
    render(<SessionConversation {...baseProps} events={[toolEvent]} onSend={vi.fn()} />)
    expect(screen.getByText('Completed')).toBeVisible()
    expect(AcpToolPresentationModule.presentAcpToolCall).toHaveBeenCalledTimes(1)

    try {
      await act(async () => {
        await i18n.changeLanguage('zh')
      })
      expect(screen.getByText('已完成')).toBeVisible()
      expect(AcpToolPresentationModule.presentAcpToolCall).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  it('sends a follow-up prompt when idle', () => {
    const onSend = vi.fn()
    render(<SessionConversation {...baseProps} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/follow-up/i)
    fireEvent.change(input, { target: { value: 'do more' } })
    const sendButton = screen.getByRole('button', { name: /send/i })
    expect(sendButton).toHaveAttribute('data-size', 'icon-xs')
    fireEvent.click(sendButton)
    expect(onSend).toHaveBeenCalledWith('do more')
  })

  it('replaces send with stop while running', () => {
    const onCancel = vi.fn()
    render(
      <SessionConversation {...baseProps} status="running" onSend={vi.fn()} onCancel={onCancel} />
    )
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /stop session/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('changes permission mode from the composer dropdown', () => {
    const onModeChange = vi.fn()
    render(<SessionConversation {...baseProps} onModeChange={onModeChange} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: /automatic mode/i }), {
      button: 0,
      ctrlKey: false
    })
    fireEvent.click(screen.getByRole('menuitemradio', { name: /confirmation mode/i }))

    expect(onModeChange).toHaveBeenCalledWith('ask')
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
