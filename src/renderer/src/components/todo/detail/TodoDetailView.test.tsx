// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

let items: TodoItem[] = []
const mockState = {
  updateTodoItem: vi.fn().mockResolvedValue(undefined),
  closeTodoDetail: vi.fn(),
  get todoItems() {
    return items
  }
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))
// InProgressPanel pulls the acp slice; stub it to keep this test focused on partitioning.
vi.mock('./InProgressPanel', () => ({
  InProgressPanel: () => <div>in-progress-panel</div>
}))
vi.mock('./HumanReviewPanel', () => ({
  HumanReviewPanel: () => <div>human-review-panel</div>
}))
vi.mock('./MergingPanel', () => ({
  MergingPanel: () => <div>merging-panel</div>
}))
// MarkdownPreview reads a deep slice of the real store; stub it for the same reason.
vi.mock('@/components/editor/MarkdownPreview', () => ({
  default: () => <div>markdown-preview</div>
}))

const { TodoDetailView } = await import('./TodoDetailView')

afterEach(() => {
  cleanup()
  items = []
  vi.clearAllMocks()
})

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Do it',
    description: 'desc',
    status: 'todo',
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
    preferredAgent: null,
    ...overrides
  }
}

describe('TodoDetailView', () => {
  it('renders the overview for non-execution statuses', () => {
    items = [mkItem({ status: 'todo' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('Do it')).toBeInTheDocument()
  })

  it('renders the InProgressPanel for in_progress', () => {
    items = [mkItem({ status: 'in_progress' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('in-progress-panel')).toBeInTheDocument()
  })

  it('renders the HumanReviewPanel for human_review', () => {
    items = [mkItem({ status: 'human_review' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('human-review-panel')).toBeInTheDocument()
  })

  it('renders the MergingPanel for merging', () => {
    items = [mkItem({ status: 'merging' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('merging-panel')).toBeInTheDocument()
  })

  it('closes when the item no longer exists', () => {
    items = []
    render(<TodoDetailView itemId="ghost" />)
    expect(mockState.closeTodoDetail).toHaveBeenCalledTimes(1)
  })
})
