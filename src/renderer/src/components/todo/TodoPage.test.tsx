// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoPage from './TodoPage'

vi.mock('./TodoBoard', () => ({ TodoBoard: () => <div data-testid="board" /> }))
vi.mock('./dashboard/TodoDashboard', () => ({
  TodoDashboard: () => <div data-testid="dashboard" />
}))
vi.mock('./TodoProjectSwitcher', () => ({
  TodoProjectSwitcher: () => <div data-testid="switcher" />
}))

const fakeState = {
  loadTodoProjects: vi.fn(async () => {}),
  loadTodoTemplates: vi.fn(async () => {}),
  loadTodoItems: vi.fn(async () => {}),
  todoActiveProjectId: 'p1',
  todoItems: [],
  moveTodoItem: vi.fn(),
  todoDetailItemId: null,
  openTodoDetail: vi.fn(),
  closeTodoDetail: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof fakeState) => unknown) => selector(fakeState)
}))

afterEach(() => {
  cleanup()
})

describe('TodoPage viewMode', () => {
  it('renders the board by default and switches to the dashboard tab', async () => {
    const user = userEvent.setup()
    render(<TodoPage />)
    expect(screen.getByTestId('board')).toBeInTheDocument()
    await user.click(screen.getByText(/data/i))
    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument())
  })
})
