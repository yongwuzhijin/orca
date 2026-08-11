// @vitest-environment happy-dom

// Why: the pane is the only place that decides *where* a copy goes and *what*
// the toolbar writes back to the store. Both are easy to regress silently, so
// exercise them by mounting rather than by reading the handlers.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const updateJsonFormatterState = vi.fn()
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ updateJsonFormatterState, settings: null, editorFontZoomLevel: 0 })
}))

vi.mock('sonner', () => ({ toast: toasts }))

// Why: happy-dom reports every element as zero-height, so the real virtualizer
// windows down to no rows at all. Mount the full range instead.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize
  }: {
    count: number
    estimateSize: (index: number) => number
  }) => ({
    getTotalSize: () => count * estimateSize(0),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * estimateSize(0)
      })),
    measureElement: (): void => {}
  })
}))

// Why: Monaco pulls in workers and CSS that happy-dom cannot load, and the
// input's own contract is covered by the editor it delegates to.
vi.mock('./JsonFormatterInput', () => ({
  JsonFormatterInput: ({ value }: { value: string }) => <div data-testid="json-input">{value}</div>
}))

import { JsonFormatterPane } from './JsonFormatterPane'

const FILE_ID = 'wt-1::json-formatter'
const writeClipboardText = vi.fn<(text: string) => Promise<void>>()

function mountPane(props: Partial<React.ComponentProps<typeof JsonFormatterPane>> = {}): {
  container: HTMLDivElement
  root: Root
} {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => {
    root.render(
      <TooltipProvider>
        <JsonFormatterPane
          fileId={FILE_ID}
          input='{"a":{"b":1}}'
          keepEscapes={true}
          showLineNumbers={false}
          {...props}
        />
      </TooltipProvider>
    )
  })
  return { container, root }
}

function toolbarButton(container: HTMLDivElement, label: string): HTMLButtonElement {
  const node = container.querySelector(`button[aria-label="${label}"]`)
  if (!(node instanceof HTMLButtonElement)) {
    throw new Error(`no toolbar button labelled ${label}`)
  }
  return node
}

describe('JsonFormatterPane', () => {
  let mounted: { container: HTMLDivElement; root: Root } | null = null

  beforeEach(() => {
    updateJsonFormatterState.mockReset()
    toasts.success.mockReset()
    toasts.error.mockReset()
    writeClipboardText.mockReset()
    writeClipboardText.mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText } }
    })
  })

  afterEach(() => {
    if (mounted) {
      act(() => mounted?.root.unmount())
      mounted.container.remove()
      mounted = null
    }
    vi.useRealTimers()
  })

  it('previews the input on first paint instead of flashing the empty hint', () => {
    mounted = mountPane()

    // Why: the parse is debounced for keystrokes, but a tab that opens with
    // content already in the store must not render "paste JSON here" first.
    expect(mounted.container.textContent).not.toContain('Paste JSON on the left')
    expect(mounted.container.querySelectorAll('[data-testid="json-tree-row"]').length).toBe(3)
  })

  it('routes a node-path copy through the IPC bridge, not navigator.clipboard', async () => {
    mounted = mountPane()
    const rowButton = mounted.container.querySelector(
      '[data-testid="json-tree-row"] button:not([aria-expanded])'
    )
    if (!(rowButton instanceof HTMLButtonElement)) {
      throw new Error('no copyable row button rendered')
    }

    await act(async () => {
      rowButton.click()
    })

    expect(writeClipboardText).toHaveBeenCalledWith('$')
    expect(toasts.success).toHaveBeenCalledWith('Path copied')
  })

  it('reports a rejected clipboard write instead of claiming success', async () => {
    writeClipboardText.mockRejectedValue(new Error('denied'))
    mounted = mountPane()
    const rowButton = mounted.container.querySelector(
      '[data-testid="json-tree-row"] button:not([aria-expanded])'
    )
    if (!(rowButton instanceof HTMLButtonElement)) {
      throw new Error('no copyable row button rendered')
    }

    await act(async () => {
      rowButton.click()
    })

    expect(toasts.error).toHaveBeenCalledWith('Copy failed')
    expect(toasts.success).not.toHaveBeenCalled()
  })

  it('copies the pretty-printed JSON, not the raw input text', async () => {
    mounted = mountPane()

    await act(async () => {
      toolbarButton(mounted!.container, 'Copy formatted JSON').click()
    })

    expect(writeClipboardText).toHaveBeenCalledWith('{\n  "a": {\n    "b": 1\n  }\n}')
    expect(toasts.success).toHaveBeenCalledWith('JSON copied')
  })

  it('writes the formatted text back to the store when formatting', () => {
    mounted = mountPane()

    act(() => toolbarButton(mounted!.container, 'Format').click())

    expect(updateJsonFormatterState).toHaveBeenCalledWith(FILE_ID, {
      input: '{\n  "a": {\n    "b": 1\n  }\n}'
    })
  })

  it.each([
    { label: 'Clear input', patch: { input: '' } },
    { label: 'Show line numbers', patch: { showLineNumbers: true } }
  ])('patches the store from the $label action', ({ label, patch }) => {
    mounted = mountPane()

    act(() => toolbarButton(mounted!.container, label).click())

    expect(updateJsonFormatterState).toHaveBeenCalledWith(FILE_ID, patch)
  })

  it('disables format and copy while the input cannot be parsed', () => {
    mounted = mountPane({ input: '{"a":' })

    expect(toolbarButton(mounted.container, 'Format').disabled).toBe(true)
    expect(toolbarButton(mounted.container, 'Copy formatted JSON').disabled).toBe(true)
    expect(mounted.container.textContent).toContain('Invalid JSON syntax.')
  })

  it('debounces re-parsing so a burst of keystrokes previews only the last one', () => {
    vi.useFakeTimers()
    mounted = mountPane({ input: '{"a":1}' })

    const rerender = (input: string): void => {
      act(() => {
        mounted?.root.render(
          <TooltipProvider>
            <JsonFormatterPane
              fileId={FILE_ID}
              input={input}
              keepEscapes={true}
              showLineNumbers={false}
            />
          </TooltipProvider>
        )
      })
    }

    rerender('{"a":1,')
    act(() => vi.advanceTimersByTime(150))
    // Why: the intermediate broken state must never reach the preview, or every
    // keystroke inside an object would flash a syntax error.
    expect(mounted.container.textContent).not.toContain('Invalid JSON syntax.')

    rerender('{"a":1,"b":2}')
    act(() => vi.advanceTimersByTime(200))
    expect(mounted.container.querySelectorAll('[data-testid="json-tree-row"]').length).toBe(3)
  })
})
