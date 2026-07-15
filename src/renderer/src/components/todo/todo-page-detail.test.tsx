// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

let detailId: string | null = null
const mockState = {
  loadTodoProjects: vi.fn().mockResolvedValue(undefined),
  loadTodoTemplates: vi.fn().mockResolvedValue(undefined),
  loadTodoItems: vi.fn().mockResolvedValue(undefined),
  moveTodoItem: vi.fn(),
  openTodoDetail: vi.fn(),
  closeTodoDetail: vi.fn(),
  todoActiveProjectId: 'p1',
  todoProjects: [],
  todoItems: [],
  get todoDetailItemId() {
    return detailId
  }
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))
vi.mock('./TodoBoard', () => ({ TodoBoard: () => <div data-testid="board" /> }))
vi.mock('./dashboard/TodoDashboard', () => ({
  TodoDashboard: () => <div data-testid="dashboard" />
}))
vi.mock('./detail/TodoDetailView', () => ({
  TodoDetailView: ({ itemId }: { itemId: string }) => <div>detail-view:{itemId}</div>
}))

const TodoPage = (await import('./TodoPage')).default

afterEach(() => {
  cleanup()
  detailId = null
  vi.clearAllMocks()
})

describe('TodoPage detail navigation', () => {
  it('shows the board when no detail item is open', () => {
    detailId = null
    render(<TodoPage />)
    expect(screen.queryByText(/detail-view:/)).not.toBeInTheDocument()
  })

  it('shows the full-page detail when todoDetailItemId is set', () => {
    detailId = 't1'
    render(<TodoPage />)
    expect(screen.getByText('detail-view:t1')).toBeInTheDocument()
  })
})
