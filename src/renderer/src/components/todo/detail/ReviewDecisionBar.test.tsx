// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const updateTodoItem = vi.fn().mockResolvedValue(undefined)
const mockState = { updateTodoItem }

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { ReviewDecisionBar } = await import('./ReviewDecisionBar')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mkItem(): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'x',
    description: '',
    status: 'human_review',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 't1',
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    workspaceProjectId: null,
    workspaceName: null,
    preferredAgent: null
  }
}

describe('ReviewDecisionBar', () => {
  it('Approve moves the item to merging', () => {
    render(<ReviewDecisionBar item={mkItem()} />)
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'merging' })
  })

  it('Reject moves the item to rework', () => {
    render(<ReviewDecisionBar item={mkItem()} />)
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'rework' })
  })
})
