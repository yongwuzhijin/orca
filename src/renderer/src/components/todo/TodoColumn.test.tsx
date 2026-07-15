// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'

import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TodoColumn } from './TodoColumn'
import { getTodoStatusMeta } from './todo-status-catalog'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../shared/todo/todo-status'

// vitest config has no globals, so testing-library's auto-cleanup never registers;
// unmount between tests so queries don't pick up stale columns.
afterEach(cleanup)

function mkItem(id: string, status: TodoStatus, scheduledDate: string | null): TodoItem {
  return {
    id,
    identifier: `P-${id}`,
    projectId: 'p',
    title: `Item ${id}`,
    description: '',
    status,
    priority: 'none',
    scheduledDate,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: id,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    workspaceProjectId: null,
    workspaceName: null,
    preferredAgent: null
  }
}

// TodoCard's useSortable expects a DndContext; provide a bare one so cards render.
function renderColumn(meta: ReturnType<typeof getTodoStatusMeta>, items: TodoItem[]): void {
  render(
    <TooltipProvider>
      <DndContext>
        <TodoColumn meta={meta} items={items} onOpenItem={() => {}} onCreate={() => {}} />
      </DndContext>
    </TooltipProvider>
  )
}

describe('TodoColumn today filter', () => {
  it('hides future-dated items in the default today view of the todo column', () => {
    const meta = getTodoStatusMeta('todo')
    renderColumn(meta, [
      mkItem('unscheduled', 'todo', null),
      mkItem('overdue', 'todo', '2000-01-01'),
      mkItem('future', 'todo', '2999-01-01')
    ])
    expect(screen.getByText('Item unscheduled')).toBeInTheDocument()
    expect(screen.getByText('Item overdue')).toBeInTheDocument()
    expect(screen.queryByText('Item future')).not.toBeInTheDocument()
  })

  it('reveals future-dated items after clicking the All toggle', () => {
    const meta = getTodoStatusMeta('todo')
    renderColumn(meta, [
      mkItem('unscheduled', 'todo', null),
      mkItem('future', 'todo', '2999-01-01')
    ])
    expect(screen.queryByText('Item future')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Item future')).toBeInTheDocument()
  })

  it('shows all items and no toggle for a non-todo column', () => {
    const meta = getTodoStatusMeta('backlog')
    renderColumn(meta, [
      mkItem('unscheduled', 'backlog', null),
      mkItem('future', 'backlog', '2999-01-01')
    ])
    expect(screen.getByText('Item unscheduled')).toBeInTheDocument()
    expect(screen.getByText('Item future')).toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
    expect(screen.queryByText('All')).not.toBeInTheDocument()
  })
})
