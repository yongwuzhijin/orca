// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { TodoPriorityMenu } from './TodoPriorityMenu'

afterEach(cleanup)

describe('TodoPriorityMenu', () => {
  it('shows Set priority when unset and lists options on open', () => {
    const onChange = vi.fn()
    render(<TodoPriorityMenu value="none" onChange={onChange} />)
    expect(screen.getByRole('button', { name: /change priority/i })).toHaveTextContent(
      'Set priority'
    )
    fireEvent.click(screen.getByRole('button', { name: /change priority/i }))
    fireEvent.click(screen.getByRole('option', { name: /urgent/i }))
    expect(onChange).toHaveBeenCalledWith('urgent')
  })

  it('shows the selected priority label on the trigger', () => {
    render(<TodoPriorityMenu value="high" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /change priority/i })).toHaveTextContent('High')
  })
})
