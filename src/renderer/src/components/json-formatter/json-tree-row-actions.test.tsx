// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JsonTreeRow } from './json-tree-rows'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { JsonTreeRowActions } = await import('./JsonTreeRowActions')

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
})

function makeRow(overrides: Partial<JsonTreeRow> = {}): JsonTreeRow {
  return {
    path: 'data[0].code',
    segments: ['data', 0, 'code'],
    depth: 3,
    kind: 'string',
    label: 'code',
    labelKind: 'key',
    value: 'psfwlx',
    childCount: 0,
    isExpandable: false,
    isCollapsed: false,
    ...overrides
  }
}

function mount(row: JsonTreeRow): {
  onCopyPair: ReturnType<typeof vi.fn>
  onCopyPath: ReturnType<typeof vi.fn>
  onCopyValue: ReturnType<typeof vi.fn>
  onDelete: ReturnType<typeof vi.fn>
} {
  const handlers = {
    onCopyPair: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyValue: vi.fn(),
    onDelete: vi.fn()
  }
  act(() => {
    createRoot(container).render(<JsonTreeRowActions row={row} {...handlers} />)
  })
  return handlers
}

function button(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) {
    throw new Error(`no button labelled ${label}`)
  }
  return found
}

describe('JsonTreeRowActions', () => {
  it('exposes four labelled actions', () => {
    mount(makeRow())
    for (const label of ['Copy', 'Copy path', 'Copy value', 'Delete node']) {
      expect(button(label).title).toBe(label)
    }
    expect(container.querySelectorAll('button')).toHaveLength(4)
  })

  it('routes each button to its handler', () => {
    const row = makeRow()
    const handlers = mount(row)
    act(() => {
      button('Copy').click()
    })
    expect(handlers.onCopyPair).toHaveBeenCalledWith(row)
    act(() => {
      button('Copy path').click()
    })
    expect(handlers.onCopyPath).toHaveBeenCalledWith('data[0].code')
    act(() => {
      button('Copy value').click()
    })
    expect(handlers.onCopyValue).toHaveBeenCalledWith(row)
    act(() => {
      button('Delete node').click()
    })
    expect(handlers.onDelete).toHaveBeenCalledWith(row)
  })

  it('hides delete on the root node', () => {
    mount(makeRow({ path: '', segments: [], label: null, labelKind: null }))
    expect(container.querySelectorAll('button')).toHaveLength(3)
    expect(container.querySelector('button[aria-label="Delete node"]')).toBeNull()
  })
})
