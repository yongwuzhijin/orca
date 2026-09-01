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
// Why: a fresh names array per hook call, so a second useDesignDocFiles instance is visible.
let designDocCalls = 0
const designDocEnabled = vi.fn()
vi.mock('./use-design-doc-files', () => ({
  useDesignDocFiles: (_item: unknown, enabled: boolean) => {
    designDocCalls += 1
    designDocEnabled(enabled)
    return {
      dirPath: '/repo/.orca/design/P-1',
      connectionId: undefined,
      names: [`doc-${designDocCalls}.md`],
      loading: false,
      refresh: vi.fn()
    }
  }
}))
const solutionDesignPanelProps = vi.fn()
vi.mock('./SolutionDesignPanel', () => ({
  SolutionDesignPanel: (props: unknown) => {
    solutionDesignPanelProps(props)
    return <div>solution-design-panel</div>
  }
}))
vi.mock('./MergingPanel', () => ({
  MergingPanel: () => <div>merging-panel</div>
}))
vi.mock('./EnterInProgressDialog', () => ({
  EnterInProgressDialog: () => <div data-testid="enter-in-progress-dialog" />
}))
vi.mock('./TodoDetailWorkspaceMeta', () => ({
  TodoDetailWorkspaceMeta: () => <div data-testid="todo-detail-workspace-meta" />
}))
vi.mock('./ReviewDecisionBar', () => ({
  ReviewDecisionBar: () => <div data-testid="review-decision-bar">decision-bar</div>
}))
const startImplementationProps = vi.fn()
vi.mock('./StartImplementationButton', () => ({
  StartImplementationButton: (props: unknown) => {
    startImplementationProps(props)
    return <div data-testid="start-implementation-button" />
  }
}))
// MarkdownPreview reads a deep slice of the real store; stub it for the same reason.
vi.mock('@/components/editor/MarkdownPreview', () => ({
  default: () => <div>markdown-preview</div>
}))

const { TodoDetailView } = await import('./TodoDetailView')

afterEach(() => {
  cleanup()
  items = []
  designDocCalls = 0
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
    workspaceProjectIds: [],
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    prdLink: null,
    executionMode: null,
    boundWorktreeId: null,
    designStageEnabled: false,
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

  it('renders the SolutionDesignPanel for solution_design', () => {
    items = [mkItem({ status: 'solution_design' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('solution-design-panel')).toBeInTheDocument()
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

  it('shows Start task in the header for todo only', () => {
    items = [mkItem({ status: 'todo' })]
    const { rerender } = render(<TodoDetailView itemId="t1" />)
    expect(screen.getByRole('button', { name: /start task/i })).toBeInTheDocument()

    items = [mkItem({ status: 'solution_design' })]
    rerender(<TodoDetailView itemId="t1" />)
    expect(screen.queryByRole('button', { name: /start task/i })).not.toBeInTheDocument()

    items = [mkItem({ status: 'in_progress' })]
    rerender(<TodoDetailView itemId="t1" />)
    expect(screen.queryByRole('button', { name: /start task/i })).not.toBeInTheDocument()
  })

  it('opens EnterInProgressDialog from the Start task header button', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    items = [mkItem({ status: 'todo' })]
    render(<TodoDetailView itemId="t1" />)
    await user.click(screen.getByRole('button', { name: /start task/i }))
    expect(screen.getByTestId('enter-in-progress-dialog')).toBeInTheDocument()
  })

  it('keeps the scheduled date input read-only', () => {
    items = [mkItem({ status: 'todo', scheduledDate: '2026-07-14' })]
    render(<TodoDetailView itemId="t1" />)
    const dateInput = screen.getByLabelText(/scheduled/i)
    expect(dateInput).toBeDisabled()
  })

  it('toggles the design-stage flag both ways from the property rail', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    items = [mkItem({ status: 'todo', designStageEnabled: false })]
    const { rerender } = render(<TodoDetailView itemId="t1" />)
    await user.click(screen.getByLabelText(/solution design stage/i))
    expect(mockState.updateTodoItem).toHaveBeenLastCalledWith('t1', { designStageEnabled: true })

    items = [mkItem({ status: 'todo', designStageEnabled: true })]
    rerender(<TodoDetailView itemId="t1" />)
    await user.click(screen.getByLabelText(/solution design stage/i))
    expect(mockState.updateTodoItem).toHaveBeenLastCalledWith('t1', { designStageEnabled: false })
  })

  it('seeds the design-stage checkbox from the card', () => {
    items = [mkItem({ status: 'todo', designStageEnabled: true })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByLabelText(/solution design stage/i)).toBeChecked()
  })

  it('shows Start implementation in the rail only for solution_design', () => {
    items = [mkItem({ status: 'todo' })]
    const { rerender } = render(<TodoDetailView itemId="t1" />)
    expect(screen.queryByTestId('start-implementation-button')).not.toBeInTheDocument()

    items = [mkItem({ status: 'solution_design' })]
    rerender(<TodoDetailView itemId="t1" />)
    expect(screen.getByTestId('start-implementation-button')).toBeInTheDocument()
  })

  // Why: two useDesignDocFiles instances silently handed the implementation agent an empty
  // doc list after the pane had already refreshed; one shared value makes that impossible.
  it('hands the design panel and the start button the very same document list', () => {
    items = [mkItem({ status: 'solution_design' })]
    render(<TodoDetailView itemId="t1" />)

    const panel = solutionDesignPanelProps.mock.calls[0]?.[0] as { docFiles: { names: string[] } }
    const button = startImplementationProps.mock.calls[0]?.[0] as { docFiles: { names: string[] } }
    expect(panel.docFiles.names).toEqual(['doc-1.md'])
    expect(button.docFiles).toBe(panel.docFiles)
    expect(designDocCalls).toBe(1)
  })

  // Why: hoisting the hook above the stage switch would otherwise list the design directory
  // for every card — a per-turn SSH round-trip for a directory that does not exist.
  it('asks for the design documents only while the card is in the design stage', () => {
    items = [mkItem({ status: 'in_progress' })]
    const { rerender } = render(<TodoDetailView itemId="t1" />)
    expect(designDocEnabled).toHaveBeenLastCalledWith(false)

    items = [mkItem({ status: 'solution_design' })]
    rerender(<TodoDetailView itemId="t1" />)
    expect(designDocEnabled).toHaveBeenLastCalledWith(true)
  })

  it('shows Reject/Approve under scheduled date only for human_review', () => {
    items = [mkItem({ status: 'todo' })]
    const { rerender } = render(<TodoDetailView itemId="t1" />)
    expect(screen.queryByTestId('review-decision-bar')).not.toBeInTheDocument()

    items = [mkItem({ status: 'human_review' })]
    rerender(<TodoDetailView itemId="t1" />)
    expect(screen.getByTestId('review-decision-bar')).toBeInTheDocument()
  })
})
