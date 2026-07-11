// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoBoard } from './TodoBoard'
import type { TodoItem } from '../../../../shared/todo/todo-item'

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
    render(<TodoBoard items={[mkItem('1', 'todo')]} onMove={() => {}} onOpenItem={() => {}} />)
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Todo')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Human Review')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders a card in its status column', () => {
    render(<TodoBoard items={[mkItem('9', 'todo')]} onMove={() => {}} onOpenItem={() => {}} />)
    expect(screen.getByText('Item 9')).toBeInTheDocument()
  })
})
