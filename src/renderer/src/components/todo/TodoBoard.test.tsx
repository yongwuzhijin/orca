// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TodoBoard } from './TodoBoard'
import type { TodoItem } from '../../../../shared/todo/todo-item'

// vitest config has no globals, so testing-library's auto-cleanup never registers;
// unmount between tests so getAllByRole doesn't pick up stale boards.
afterEach(cleanup)

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
    completedAt: null
  }
}

describe('TodoBoard', () => {
  it('renders the five default-visible columns', () => {
    render(
      <TodoBoard
        items={[mkItem('1', 'todo')]}
        onMove={() => {}}
        onOpenItem={() => {}}
        onCreate={() => {}}
      />
    )
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Todo')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Human Review')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders a card in its status column', () => {
    render(
      <TodoBoard
        items={[mkItem('9', 'todo')]}
        onMove={() => {}}
        onOpenItem={() => {}}
        onCreate={() => {}}
      />
    )
    expect(screen.getByText('Item 9')).toBeInTheDocument()
  })

  it('creates from a column tail with that column status preselected', () => {
    const onCreate = vi.fn()
    render(<TodoBoard items={[]} onMove={vi.fn()} onOpenItem={vi.fn()} onCreate={onCreate} />)
    const addButtons = screen.getAllByRole('button', { name: /add task/i })
    expect(addButtons.length).toBeGreaterThanOrEqual(5)
    fireEvent.click(addButtons[0])
    expect(onCreate).toHaveBeenCalledWith('backlog')
  })
})
