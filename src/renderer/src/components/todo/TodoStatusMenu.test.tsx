// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TodoStatusMenu, TodoStatusOptionList } from './TodoStatusMenu'

afterEach(cleanup)

describe('TodoStatusOptionList', () => {
  it('renders all nine statuses in order', () => {
    render(<TodoStatusOptionList value="todo" onChange={() => {}} />)
    const labels = [
      'Todo',
      'Solution Design',
      'In Progress',
      'Rework',
      'Human Review',
      'Merging',
      'Done',
      'Canceled',
      'Duplicate'
    ]
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('shows order numbers 1..9', () => {
    render(<TodoStatusOptionList value="todo" onChange={() => {}} />)
    for (let n = 1; n <= 9; n++) {
      expect(screen.getByText(String(n))).toBeInTheDocument()
    }
  })
})

describe('TodoStatusMenu', () => {
  it('shows the current status on the trigger and opens the dropdown', () => {
    render(<TodoStatusMenu value="in_progress" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /change status/i })).toHaveTextContent('In Progress')
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    expect(screen.getByPlaceholderText(/change status/i)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /todo/i })).toBeInTheDocument()
  })
})
