// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionDisclosure } from './SessionDisclosure'

afterEach(cleanup)

describe('SessionDisclosure', () => {
  it('starts a running entry open', () => {
    render(
      <SessionDisclosure entryKey="call-1" title="Bash" running>
        <div>output</div>
      </SessionDisclosure>
    )

    expect(screen.getByRole('button', { name: /Bash/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('output')).toBeVisible()
  })

  it('starts a completed historical entry closed', () => {
    render(
      <SessionDisclosure entryKey="call-1" title="Bash">
        <div>output</div>
      </SessionDisclosure>
    )

    expect(screen.getByRole('button', { name: /Bash/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('output')).not.toBeInTheDocument()
  })

  it('toggles aria-expanded when clicked', async () => {
    const user = userEvent.setup()
    render(
      <SessionDisclosure entryKey="call-1" title="Bash">
        <div>output</div>
      </SessionDisclosure>
    )
    const trigger = screen.getByRole('button', { name: /Bash/i })

    await user.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('preserves a user-collapsed running entry after completion', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SessionDisclosure entryKey="call-1" title="Bash" running>
        <div>output</div>
      </SessionDisclosure>
    )
    await user.click(screen.getByRole('button', { name: /Bash/i }))

    rerender(
      <SessionDisclosure entryKey="call-1" title="Bash" running={false}>
        <div>output</div>
      </SessionDisclosure>
    )

    expect(screen.getByRole('button', { name: /Bash/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('resets open and user override state when entryKey changes between running entries', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <SessionDisclosure entryKey="call-1" title="First task" running>
        <div>first output</div>
      </SessionDisclosure>
    )
    await user.click(screen.getByRole('button', { name: /First task/i }))
    expect(screen.getByRole('button', { name: /First task/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    rerender(
      <SessionDisclosure entryKey="call-2" title="Second task" running>
        <div>second output</div>
      </SessionDisclosure>
    )

    expect(screen.getByRole('button', { name: /Second task/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getByText('second output')).toBeVisible()
  })

  it.each(['{Enter}', ' '])('toggles from the keyboard with %s', async (key) => {
    const user = userEvent.setup()
    render(
      <SessionDisclosure entryKey={key} title="Bash">
        <div>output</div>
      </SessionDisclosure>
    )
    const trigger = screen.getByRole('button', { name: /Bash/i })
    trigger.focus()

    await user.keyboard(key)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
