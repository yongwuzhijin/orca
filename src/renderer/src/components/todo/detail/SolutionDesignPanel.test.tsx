// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { DesignDocFiles } from './use-design-doc-files'

const paneProps = vi.fn()

vi.mock('./DesignDocPane', () => ({
  DesignDocPane: (props: unknown) => {
    paneProps(props)
    return <div data-testid="design-doc-pane" />
  }
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

const item = { id: 't1' } as TodoItem
const docFiles: DesignDocFiles = {
  dirPath: '/repo/.orca/design/ORCA-12',
  names: ['overview.md'],
  loading: false,
  refresh: vi.fn()
}

describe('SolutionDesignPanel', () => {
  it('puts the documents beside the conversation', () => {
    render(<SolutionDesignPanel item={item} docFiles={docFiles} />)

    expect(screen.getByTestId('design-doc-pane')).toBeInTheDocument()
    expect(screen.getByTestId('design-conversation')).toBeInTheDocument()
  })

  it('hides the plan in the design conversation', () => {
    render(<SolutionDesignPanel item={item} docFiles={docFiles} />)

    expect(screen.getByText('in-progress-panel-false')).toBeInTheDocument()
  })

  // Why: the panel must forward the caller's list, not fetch a second one of its own.
  it('hands the pane the document list it was given', () => {
    render(<SolutionDesignPanel item={item} docFiles={docFiles} />)

    expect(paneProps).toHaveBeenCalledWith(expect.objectContaining({ docFiles }))
  })
})
