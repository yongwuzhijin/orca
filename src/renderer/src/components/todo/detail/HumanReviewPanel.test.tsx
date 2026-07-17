// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

vi.mock('./ReviewBrowserPane', () => ({ ReviewBrowserPane: () => <div>review-browser</div> }))
vi.mock('./InProgressPanel', () => ({
  InProgressPanel: ({ showPlan }: { showPlan?: boolean }) => (
    <div>in-progress-panel-{String(showPlan)}</div>
  )
}))

const { HumanReviewPanel } = await import('./HumanReviewPanel')

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
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null
  }
}

describe('HumanReviewPanel', () => {
  it('renders preview and verify panel without Reject/Approve', () => {
    render(<HumanReviewPanel item={mkItem()} />)
    expect(screen.getByText('review-browser')).toBeInTheDocument()
    expect(screen.getByText('in-progress-panel-false')).toBeInTheDocument()
    expect(screen.getByTestId('review-conversation')).toHaveClass(
      'rounded-md',
      'border',
      'border-border'
    )
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
  })
})
