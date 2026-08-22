// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserApiTestHeader } from '../../../../../shared/browser-api-test-types'
import { BrowserApiTestHeaderRows } from './browser-api-test-header-rows'

const rows: BrowserApiTestHeader[] = [
  { name: 'X-One', value: '1', enabled: true },
  { name: 'X-Two', value: '2', enabled: false }
]

function nameFields(): HTMLInputElement[] {
  return screen.getAllByLabelText('Header') as HTMLInputElement[]
}

function valueFields(): HTMLInputElement[] {
  return screen.getAllByLabelText('Value') as HTMLInputElement[]
}

describe('BrowserApiTestHeaderRows', () => {
  // Why: this suite family does not load jest-dom, so there is no auto-cleanup between cases.
  afterEach(cleanup)

  it('renders one editable row per header', () => {
    render(<BrowserApiTestHeaderRows rows={rows} onChange={vi.fn()} />)

    expect(nameFields().map((input) => input.value)).toEqual(['X-One', 'X-Two'])
    expect(valueFields().map((input) => input.value)).toEqual(['1', '2'])
  })

  it('reflects the enabled flag on each checkbox', () => {
    render(<BrowserApiTestHeaderRows rows={rows} onChange={vi.fn()} />)

    const checkboxes = screen.getAllByRole('checkbox')

    expect(checkboxes.map((box) => box.getAttribute('data-state'))).toEqual([
      'checked',
      'unchecked'
    ])
  })

  it('emits the full list with only the edited name changed', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.type(nameFields()[0], '!')

    expect(onChange).toHaveBeenCalledWith([
      { name: 'X-One!', value: '1', enabled: true },
      { name: 'X-Two', value: '2', enabled: false }
    ])
  })

  // Why: the row index is threaded through every handler, so a hardcoded 0 has to fail somewhere.
  it('edits the name of a later row without touching the first', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.type(nameFields()[1], '!')

    expect(onChange).toHaveBeenCalledWith([
      { name: 'X-One', value: '1', enabled: true },
      { name: 'X-Two!', value: '2', enabled: false }
    ])
  })

  it('emits the full list with only the edited value changed', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.type(valueFields()[1], '9')

    expect(onChange).toHaveBeenCalledWith([
      { name: 'X-One', value: '1', enabled: true },
      { name: 'X-Two', value: '29', enabled: false }
    ])
  })

  it('edits the value of the first row without touching the rest', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.type(valueFields()[0], '9')

    expect(onChange).toHaveBeenCalledWith([
      { name: 'X-One', value: '19', enabled: true },
      { name: 'X-Two', value: '2', enabled: false }
    ])
  })

  it('toggles the enabled flag of one row only', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.click(screen.getAllByRole('checkbox')[1])

    expect(onChange).toHaveBeenCalledWith([
      { name: 'X-One', value: '1', enabled: true },
      { name: 'X-Two', value: '2', enabled: true }
    ])
  })

  it('clears the enabled flag when an armed row is unchecked', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.click(screen.getAllByRole('checkbox')[0])

    expect(onChange).toHaveBeenCalledWith([
      { name: 'X-One', value: '1', enabled: false },
      { name: 'X-Two', value: '2', enabled: false }
    ])
  })

  it('drops the row whose delete button was pressed', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.click(screen.getAllByRole('button', { name: /Remove header/ })[0])

    expect(onChange).toHaveBeenCalledWith([{ name: 'X-Two', value: '2', enabled: false }])
  })

  // Why: deleting the first row is indistinguishable from deleting a hardcoded row 0.
  it('drops a later row rather than the first one', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.click(screen.getAllByRole('button', { name: /Remove header/ })[1])

    expect(onChange).toHaveBeenCalledWith([{ name: 'X-One', value: '1', enabled: true }])
  })

  it('appends a blank enabled row', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={[]} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))

    expect(onChange).toHaveBeenCalledWith([{ name: '', value: '', enabled: true }])
  })

  // Why: with an empty list, appending and prepending produce the same array, so the ordering only
  // becomes observable once there is something to push past.
  it('adds the blank row after the rows that already exist', async () => {
    const onChange = vi.fn()
    render(<BrowserApiTestHeaderRows rows={rows} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))

    expect(onChange).toHaveBeenCalledWith([...rows, { name: '', value: '', enabled: true }])
  })

  it('shows the add button even with no rows', () => {
    render(<BrowserApiTestHeaderRows rows={[]} onChange={vi.fn()} />)

    expect(screen.queryAllByLabelText('Header')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Add header' })).toBeTruthy()
  })
})
