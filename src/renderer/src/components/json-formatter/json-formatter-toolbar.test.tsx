// @vitest-environment happy-dom

// Why: every control here is icon-only, so its aria-label is the only name a
// screen reader or a test can address it by. Mount to prove the labels, the
// disabled gating and the toggle states exist rather than trusting the JSX.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { JsonFormatterToolbar } from './JsonFormatterToolbar'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ACTIVE_CLASSES = 'bg-accent text-accent-foreground'

const LABELS = [
  'Format',
  'Collapse all',
  'Expand all',
  'Show line numbers',
  'Copy formatted JSON',
  'Clear input'
]

type ToolbarHandlers = {
  onFormat: Mock<() => void>
  onCollapseAll: Mock<() => void>
  onExpandAll: Mock<() => void>
  onToggleLineNumbers: Mock<() => void>
  onToggleKeepEscapes: Mock<(value: boolean) => void>
  onCopy: Mock<() => void>
  onClear: Mock<() => void>
}

function makeHandlers(): ToolbarHandlers {
  return {
    onFormat: vi.fn<() => void>(),
    onCollapseAll: vi.fn<() => void>(),
    onExpandAll: vi.fn<() => void>(),
    onToggleLineNumbers: vi.fn<() => void>(),
    onToggleKeepEscapes: vi.fn<(value: boolean) => void>(),
    onCopy: vi.fn<() => void>(),
    onClear: vi.fn<() => void>()
  }
}

describe('JsonFormatterToolbar', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    container?.remove()
    container = null
    root = null
  })

  function mountToolbar(
    options: {
      canFormat?: boolean
      showLineNumbers?: boolean
      keepEscapes?: boolean
      handlers?: ToolbarHandlers
    } = {}
  ): ToolbarHandlers {
    const handlers = options.handlers ?? makeHandlers()
    act(() => {
      root?.render(
        <TooltipProvider>
          <JsonFormatterToolbar
            canFormat={options.canFormat ?? true}
            showLineNumbers={options.showLineNumbers ?? false}
            keepEscapes={options.keepEscapes ?? false}
            {...handlers}
          />
        </TooltipProvider>
      )
    })
    return handlers
  }

  function control(label: string): HTMLButtonElement {
    const node = container?.querySelector(`[aria-label="${label}"]`)
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error(`no button labelled ${label}`)
    }
    return node
  }

  it('exposes every action by its accessible label and its tooltip text', () => {
    mountToolbar()
    for (const label of LABELS) {
      expect(control(label)).not.toBeNull()
    }
    expect(container?.textContent).toContain('Keep escapes')
  })

  it('invokes the matching handler for each action', () => {
    const handlers = mountToolbar()

    act(() => control('Format').click())
    act(() => control('Collapse all').click())
    act(() => control('Expand all').click())
    act(() => control('Show line numbers').click())
    act(() => control('Copy formatted JSON').click())
    act(() => control('Clear input').click())

    expect(handlers.onFormat).toHaveBeenCalledTimes(1)
    expect(handlers.onCollapseAll).toHaveBeenCalledTimes(1)
    expect(handlers.onExpandAll).toHaveBeenCalledTimes(1)
    expect(handlers.onToggleLineNumbers).toHaveBeenCalledTimes(1)
    expect(handlers.onCopy).toHaveBeenCalledTimes(1)
    expect(handlers.onClear).toHaveBeenCalledTimes(1)
  })

  it('disables format and copy while the input cannot be formatted', () => {
    const handlers = mountToolbar({ canFormat: false })

    expect(control('Format').disabled).toBe(true)
    expect(control('Copy formatted JSON').disabled).toBe(true)
    // Why: navigation and clearing still work on invalid input.
    expect(control('Collapse all').disabled).toBe(false)
    expect(control('Clear input').disabled).toBe(false)

    act(() => control('Format').click())
    act(() => control('Copy formatted JSON').click())
    expect(handlers.onFormat).not.toHaveBeenCalled()
    expect(handlers.onCopy).not.toHaveBeenCalled()
  })

  it('enables format and copy once the input parses', () => {
    mountToolbar({ canFormat: true })
    expect(control('Format').disabled).toBe(false)
    expect(control('Copy formatted JSON').disabled).toBe(false)
  })

  it('reflects the line-number toggle through aria-pressed', () => {
    mountToolbar({ showLineNumbers: true })
    expect(control('Show line numbers').getAttribute('aria-pressed')).toBe('true')
    expect(control('Show line numbers').className).toContain(ACTIVE_CLASSES)

    mountToolbar({ showLineNumbers: false })
    expect(control('Show line numbers').getAttribute('aria-pressed')).toBe('false')
    // Why: the ghost variant already ships hover:bg-accent, so only the
    // unprefixed pair distinguishes the pressed state.
    expect(control('Show line numbers').className).not.toContain(ACTIVE_CLASSES)
    // Why: only the toggle is a pressed-state control; the rest are plain actions.
    expect(control('Format').hasAttribute('aria-pressed')).toBe(false)
  })

  it('toggles keep-escapes in both directions', () => {
    const off = mountToolbar({ keepEscapes: false })
    const unchecked = container?.querySelector('[role="checkbox"]')
    expect(unchecked?.getAttribute('aria-checked')).toBe('false')
    act(() => (unchecked as HTMLElement | null)?.click())
    expect(off.onToggleKeepEscapes).toHaveBeenCalledWith(true)

    const on = mountToolbar({ keepEscapes: true })
    const checked = container?.querySelector('[role="checkbox"]')
    expect(checked?.getAttribute('aria-checked')).toBe('true')
    act(() => (checked as HTMLElement | null)?.click())
    expect(on.onToggleKeepEscapes).toHaveBeenCalledWith(false)
  })

  it('treats the indeterminate checkbox value as unchecked', async () => {
    // Why: Radix's onCheckedChange can emit 'indeterminate', which is truthy —
    // the adapter must compare against true, not coerce with Boolean().
    vi.resetModules()
    let emit: ((value: boolean | 'indeterminate') => void) | null = null
    vi.doMock('@/components/ui/checkbox', () => ({
      Checkbox: ({
        checked,
        onCheckedChange
      }: {
        checked?: boolean | 'indeterminate'
        onCheckedChange?: (value: boolean | 'indeterminate') => void
      }) => {
        emit = onCheckedChange ?? null
        return <span data-testid="checkbox-stub" data-checked={String(checked)} />
      }
    }))

    try {
      const { JsonFormatterToolbar: WithStubbedCheckbox } = await import('./JsonFormatterToolbar')
      const handlers = makeHandlers()
      act(() => {
        root?.render(
          <TooltipProvider>
            <WithStubbedCheckbox
              canFormat
              showLineNumbers={false}
              keepEscapes={false}
              {...handlers}
            />
          </TooltipProvider>
        )
      })

      const send = emit as ((value: boolean | 'indeterminate') => void) | null
      expect(send).not.toBeNull()
      act(() => send?.('indeterminate'))
      expect(handlers.onToggleKeepEscapes).toHaveBeenCalledWith(false)
      expect(handlers.onToggleKeepEscapes).not.toHaveBeenCalledWith(true)

      act(() => send?.(true))
      expect(handlers.onToggleKeepEscapes).toHaveBeenLastCalledWith(true)
    } finally {
      vi.doUnmock('@/components/ui/checkbox')
      vi.resetModules()
    }
  })
})
