// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TodoBoard } from './TodoBoard'
import type { TodoItem } from '../../../../shared/todo/todo-item'

// vitest config has no globals, so testing-library's auto-cleanup never registers;
// unmount between tests so getAllByRole doesn't pick up stale boards.
afterEach(cleanup)

function renderBoard(props: ComponentProps<typeof TodoBoard>): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <TodoBoard {...props} />
    </TooltipProvider>
  )
}

function mkItem(id: string, status: TodoItem['status']): TodoItem {
  return {
    id,
    identifier: `P-${id}`,
    projectId: 'p',
    title: `Item ${id}`,
    description: '',
    status,
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: id,
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    workspaceProjectId: null,
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null
  }
}

describe('TodoBoard', () => {
  it('renders the five default-visible columns', () => {
    renderBoard({
      items: [mkItem('1', 'todo')],
      onMove: () => {},
      onOpenItem: () => {},
      onCreate: () => {}
    })
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Todo')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Human Review')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders a card in its status column', () => {
    renderBoard({
      items: [mkItem('9', 'todo')],
      onMove: () => {},
      onOpenItem: () => {},
      onCreate: () => {}
    })
    expect(screen.getByText('Item 9')).toBeInTheDocument()
  })

  it('creates from a column header with that column status preselected', () => {
    const onCreate = vi.fn()
    renderBoard({ items: [], onMove: vi.fn(), onOpenItem: vi.fn(), onCreate })
    const addButtons = screen.getAllByRole('button', { name: /new task in backlog/i })
    expect(addButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(addButtons[0])
    expect(onCreate).toHaveBeenCalledWith('backlog')
  })
})
