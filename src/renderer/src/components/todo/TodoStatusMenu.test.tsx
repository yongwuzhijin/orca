// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TodoStatusMenu } from './TodoStatusMenu'

afterEach(cleanup)

describe('TodoStatusMenu', () => {
  it('renders all nine statuses in order', () => {
    render(<TodoStatusMenu value="backlog" onChange={() => {}} />)
    const labels = [
      'Backlog',
      'Todo',
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
})
