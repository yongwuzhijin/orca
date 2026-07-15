// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { i18n } from '@/i18n/i18n'
import { SessionToolDetails } from './SessionToolDetails'

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

describe('SessionToolDetails', () => {
  it('summarizes file changes and renders semantic diff lines with line markers', () => {
    render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'edit-1',
          title: 'Edit',
          status: 'completed',
          rawInput: {
            path: 'src/a.ts',
            old_string: 'old',
            new_string: 'new\nline'
          }
        }}
      />
    )

    const trigger = screen.getByRole('button', {
      name: /src\/a\.ts.*completed.*changes.*\+2.*-1/i
    })
    expect(within(trigger).getByText('Completed')).toBeVisible()
    fireEvent.click(trigger)

    expect(within(trigger).getByLabelText(/Changes.*\+2.*-1/)).toHaveTextContent('+2/-1')
    const addedLine = screen.getByText('+new')
    const deletedLine = screen.getByText('-old')
    expect(addedLine.parentElement).toHaveClass('text-(--git-decoration-added)')
    expect(deletedLine.parentElement).toHaveClass('text-(--git-decoration-deleted)')
    expect(within(addedLine.parentElement!).getByText('2')).toBeInTheDocument()
  })

  it('shows the command in its summary and output in a bounded sleek region', () => {
    const { container } = render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'shell-1',
          title: 'Bash',
          status: 'completed',
          rawInput: { command: 'pnpm test' },
          content: { output: 'PASS' }
        }}
      />
    )

    const trigger = screen.getByRole('button', { name: /pnpm test.*completed/i })
    expect(within(trigger).getByText('Completed')).toBeVisible()
    fireEvent.click(trigger)

    const output = screen.getByLabelText('Command output')
    expect(output).toBeInTheDocument()
    expect(output).toHaveTextContent('PASS')
    expect(container.querySelector('.scrollbar-sleek')).toHaveClass('max-h-48', 'overflow-auto')
  })

  it('shows spinner, task, model, and current stage for a running subagent', () => {
    const { container } = render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'agent-1',
          title: 'Subagent',
          status: 'running',
          toolKind: 'task',
          rawInput: {
            description: '实现时间线',
            model: 'GPT-5.6 Sol',
            stage: '正在运行测试'
          }
        }}
      />
    )

    expect(screen.getByText('实现时间线')).toBeInTheDocument()
    expect(screen.getByText('GPT-5.6 Sol')).toBeInTheDocument()
    expect(screen.getByText('正在运行测试')).toHaveClass('text-muted-foreground')
    expect(screen.getByRole('button', { name: /实现时间线.*running/i })).toBeInTheDocument()
    expect(within(screen.getByRole('button')).getByText('Running')).toBeVisible()
    expect(container.querySelector('.animate-spin')).toHaveClass('motion-reduce:animate-none')
  })

  it('uses a static completed state and preserves the final result when expanded', () => {
    const { container } = render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'agent-1',
          title: 'Subagent',
          status: 'completed',
          toolKind: 'task',
          rawInput: {
            description: '实现时间线',
            model: 'GPT-5.6 Sol',
            stage: '完成验证'
          },
          content: { result: '全部测试通过' }
        }}
      />
    )

    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument()
    expect(screen.getByTestId('subagent-success-state')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /实现时间线.*completed/i })
    expect(within(trigger).getByText('Completed')).toBeVisible()
    fireEvent.click(trigger)
    expect(screen.getByLabelText('Subagent result')).toHaveTextContent('全部测试通过')
  })

  it('shows an error state instead of success for a failed subagent', () => {
    render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'agent-failed',
          title: 'Subagent',
          status: 'failed',
          toolKind: 'task',
          rawInput: { description: '运行测试' },
          content: { result: '测试失败' }
        }}
      />
    )

    const trigger = screen.getByRole('button', { name: /运行测试.*failed/i })
    expect(within(trigger).getByText('Failed')).toBeVisible()
    expect(screen.getByTestId('subagent-error-state')).toBeInTheDocument()
    expect(screen.queryByTestId('subagent-success-state')).not.toBeInTheDocument()
  })

  it.each(['canceled', 'cancelled'])(
    'shows a neutral icon and a localized status for a %s subagent',
    (status) => {
      render(
        <SessionToolDetails
          event={{
            kind: 'tool_call',
            toolCallId: `agent-${status}`,
            title: 'Subagent',
            status,
            toolKind: 'task',
            rawInput: { description: '运行测试' }
          }}
        />
      )

      const trigger = screen.getByRole('button', { name: /运行测试.*canceled/i })
      expect(within(trigger).getByText('Canceled')).toBeVisible()
      expect(screen.getByTestId('subagent-neutral-state')).toBeInTheDocument()
      expect(screen.queryByTestId('subagent-success-state')).not.toBeInTheDocument()
    }
  )

  it('renders generic tool detail as formatted JSON', () => {
    render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'generic-1',
          title: 'Skill',
          status: 'completed',
          rawInput: { name: 'review' }
        }}
      />
    )

    const trigger = screen.getByRole('button', { name: /Skill.*completed/i })
    expect(within(trigger).getByText('Completed')).toBeVisible()
    fireEvent.click(trigger)
    expect(screen.getByLabelText('Details')).toHaveTextContent('"name": "review"')
  })

  it.each([
    ['pending', 'Pending'],
    ['running', 'Running'],
    ['in_progress', 'Running'],
    ['completed', 'Completed'],
    ['complete', 'Completed'],
    ['success', 'Completed'],
    ['succeeded', 'Completed'],
    ['error', 'Failed'],
    ['failed', 'Failed'],
    ['failure', 'Failed'],
    ['canceled', 'Canceled'],
    ['cancelled', 'Canceled']
  ])('formats the %s protocol status as %s', (status, expected) => {
    render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: `status-${status}`,
          title: 'Status tool',
          status
        }}
      />
    )

    expect(within(screen.getByRole('button')).getByText(expected)).toBeVisible()
  })

  it('uses the active locale for known statuses and leaves unknown statuses unchanged', async () => {
    await i18n.changeLanguage('zh')
    const { rerender } = render(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'status-running',
          title: 'Status tool',
          status: 'in_progress'
        }}
      />
    )

    expect(within(screen.getByRole('button')).getByText('运行中')).toBeVisible()

    rerender(
      <SessionToolDetails
        event={{
          kind: 'tool_call',
          toolCallId: 'status-custom',
          title: 'Status tool',
          status: 'warming_up'
        }}
      />
    )
    expect(within(screen.getByRole('button')).getByText('warming_up')).toBeVisible()
  })

  it('renders malformed data title without throwing', () => {
    expect(() =>
      render(
        <SessionToolDetails
          event={{
            kind: 'tool_call',
            toolCallId: 'broken-1',
            title: 'Broken tool',
            status: 'completed',
            rawInput: Symbol('broken')
          }}
        />
      )
    ).not.toThrow()
    expect(screen.getByRole('button', { name: /Broken tool/i })).toBeInTheDocument()
  })
})
