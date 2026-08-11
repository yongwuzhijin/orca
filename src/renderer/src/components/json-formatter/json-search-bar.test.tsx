// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { JsonSearchBar } = await import('./JsonSearchBar')

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
})

type MountResult = {
  onQueryChange: ReturnType<typeof vi.fn>
  onMoveToMatch: ReturnType<typeof vi.fn>
}

function mount(
  props: { query?: string; matchCount?: number; activeMatchIndex?: number } = {}
): MountResult {
  const handlers = { onQueryChange: vi.fn(), onMoveToMatch: vi.fn() }
  act(() => {
    createRoot(container).render(
      <JsonSearchBar
        query={props.query ?? ''}
        matchCount={props.matchCount ?? 0}
        activeMatchIndex={props.activeMatchIndex ?? -1}
        onQueryChange={handlers.onQueryChange}
        onMoveToMatch={handlers.onMoveToMatch}
      />
    )
  })
  return handlers
}

function input(): HTMLInputElement {
  const found = container.querySelector('input')
  if (found === null) {
    throw new Error('no search input')
  }
  return found
}

function counter(): string | null {
  return container.querySelector('[data-testid="json-search-count"]')?.textContent ?? null
}

function button(label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) {
    throw new Error(`no button labelled ${label}`)
  }
  return found
}

describe('JsonSearchBar', () => {
  it('shows no counter for an empty query', () => {
    mount()
    expect(counter()).toBeNull()
  })

  it('counts from one', () => {
    mount({ query: 'a', matchCount: 17, activeMatchIndex: 2 })
    expect(counter()).toBe('3/17')
  })

  it('reports an empty result set', () => {
    mount({ query: 'zzz', matchCount: 0, activeMatchIndex: -1 })
    expect(counter()).toBe('No results')
  })

  it('reports typing', () => {
    const handlers = mount()
    act(() => {
      // Why: React's value tracker shadows the `value` property, so a plain
      // assignment would look like a no-op and never fire onChange.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input(),
        'code'
      )
      input().dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(handlers.onQueryChange).toHaveBeenCalledWith('code')
  })

  it('moves forward on Enter and backward on Shift+Enter', () => {
    const handlers = mount({ query: 'a', matchCount: 2, activeMatchIndex: 0 })
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(handlers.onMoveToMatch).toHaveBeenCalledWith(1)
    act(() => {
      input().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      )
    })
    expect(handlers.onMoveToMatch).toHaveBeenLastCalledWith(-1)
  })

  it('clears the query on Escape', () => {
    const handlers = mount({ query: 'a', matchCount: 2, activeMatchIndex: 0 })
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(handlers.onQueryChange).toHaveBeenCalledWith('')
  })

  it('moves through matches with the chevron buttons', () => {
    const handlers = mount({ query: 'a', matchCount: 2, activeMatchIndex: 0 })
    act(() => {
      button('Previous match').click()
    })
    expect(handlers.onMoveToMatch).toHaveBeenCalledWith(-1)
    act(() => {
      button('Next match').click()
    })
    expect(handlers.onMoveToMatch).toHaveBeenLastCalledWith(1)
  })

  it('does not steal focus when a chevron is pressed', () => {
    mount({ query: 'a', matchCount: 2, activeMatchIndex: 0 })
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    act(() => {
      button('Next match').dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
  })

  it('keeps shortcuts from leaking to the app', () => {
    mount({ query: 'a', matchCount: 1, activeMatchIndex: 0 })
    const bubbled = vi.fn()
    document.addEventListener('keydown', bubbled)
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })
    document.removeEventListener('keydown', bubbled)
    expect(bubbled).not.toHaveBeenCalled()
  })
})
