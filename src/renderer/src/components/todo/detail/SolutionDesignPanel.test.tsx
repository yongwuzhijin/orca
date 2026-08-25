// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

vi.mock('./DesignDocPane', () => ({
  DesignDocPane: () => <div data-testid="design-doc-pane" />
}))
vi.mock('./InProgressPanel', () => ({
  InProgressPanel: ({ showPlan }: { showPlan?: boolean }) => (
    <div>in-progress-panel-{String(showPlan)}</div>
  )
}))

const { SolutionDesignPanel } = await import('./SolutionDesignPanel')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SolutionDesignPanel', () => {
  it('puts the documents beside the conversation', () => {
    render(<SolutionDesignPanel item={{ id: 't1' } as TodoItem} />)

    expect(screen.getByTestId('design-doc-pane')).toBeInTheDocument()
    expect(screen.getByTestId('design-conversation')).toBeInTheDocument()
  })

  it('hides the plan in the design conversation', () => {
    render(<SolutionDesignPanel item={{ id: 't1' } as TodoItem} />)

    expect(screen.getByText('in-progress-panel-false')).toBeInTheDocument()
  })
})
