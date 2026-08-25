// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const dialogProps = vi.fn()

vi.mock('./use-design-doc-files', () => ({
  useDesignDocFiles: () => ({
    dirPath: '/repo/.orca/design/ORCA-12',
    connectionId: undefined,
    names: ['overview.md'],
    loading: false,
    refresh: vi.fn()
  })
}))
vi.mock('./EnterInProgressDialog', () => ({
  EnterInProgressDialog: (props: unknown) => {
    dialogProps(props)
    return <div data-testid="start-dialog" />
  }
}))

const { StartImplementationButton } = await import('./StartImplementationButton')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const item = { id: 't1', identifier: 'ORCA-12', status: 'solution_design' } as TodoItem

describe('StartImplementationButton', () => {
  it('opens the start dialog in handoff mode with the design docs', async () => {
    const user = userEvent.setup()
    render(<StartImplementationButton item={item} />)
    expect(screen.queryByTestId('start-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /start implementation/i }))

    expect(screen.getByTestId('start-dialog')).toBeInTheDocument()
    expect(dialogProps).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'from-design', designDocNames: ['overview.md'] })
    )
  })

  it('dismisses the dialog when it reports a close', async () => {
    const user = userEvent.setup()
    render(<StartImplementationButton item={item} />)
    await user.click(screen.getByRole('button', { name: /start implementation/i }))

    const props = dialogProps.mock.calls[0]?.[0] as { onClose: () => void }
    await act(async () => props.onClose())

    expect(screen.queryByTestId('start-dialog')).not.toBeInTheDocument()
  })
})
