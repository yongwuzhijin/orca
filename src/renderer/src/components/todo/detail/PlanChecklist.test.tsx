// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PlanChecklist } from './PlanChecklist'

afterEach(cleanup)

describe('PlanChecklist', () => {
  it('renders each plan entry content', () => {
    render(
      <PlanChecklist
        entries={[
          { content: 'step one', status: 'completed' },
          { content: 'step two', status: 'in_progress' },
          { content: 'step three', status: 'pending' }
        ]}
      />
    )
    expect(screen.getByText('step one')).toBeInTheDocument()
    expect(screen.getByText('step two')).toBeInTheDocument()
    expect(screen.getByText('step three')).toBeInTheDocument()
  })

  it('marks the completed entry with a checked state', () => {
    render(<PlanChecklist entries={[{ content: 'done step', status: 'completed' }]} />)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-status', 'completed')
  })

  it('renders an empty hint when there are no entries', () => {
    render(<PlanChecklist entries={[]} />)
    expect(screen.getByText(/no plan/i)).toBeInTheDocument()
  })
})
