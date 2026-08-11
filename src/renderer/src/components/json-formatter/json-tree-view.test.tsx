// @vitest-environment happy-dom

// Why: the pane owns two things worth pinning by mounting — which of the three
// parse states it shows, and the fact that a line number is just the visible row
// index + 1 (so collapsing renumbers instead of leaving gaps).
//
// The virtualizer is stubbed because happy-dom gives every element zero height,
// so the real one would window down to nothing and quietly void every
// assertion below. `virtualWindow.range` narrows the stub for the one test that
// pins the windowing itself; every other test sees the whole list.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeJsonParseError } from './json-parse-error-message'
import { createJsonExpansion, toggleJsonNode } from './json-tree-expansion'
import type { JsonExpansionState } from './json-tree-expansion'
import type * as JsonTreeRowsModule from './json-tree-rows'
import type { JsonParseResult } from './parse-json-input'

const virtualWindow = vi.hoisted(() => ({
  range: null as { start: number; end: number } | null
}))

const rowBuilds = vi.hoisted(() => ({ count: 0 }))

vi.mock('./json-tree-rows', async (importOriginal) => {
  const actual = await importOriginal<typeof JsonTreeRowsModule>()
  return {
    ...actual,
    buildVisibleJsonRows: (value: unknown, expansion: JsonExpansionState) => {
      rowBuilds.count += 1
      return actual.buildVisibleJsonRows(value, expansion)
    }
  }
})

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize
  }: {
    count: number
    estimateSize: (index: number) => number
  }) => {
    const size = estimateSize(0)
    const start = virtualWindow.range ? Math.min(virtualWindow.range.start, count) : 0
    const end = virtualWindow.range ? Math.min(virtualWindow.range.end, count - 1) : count - 1
    return {
      getTotalSize: () => count * size,
      getVirtualItems: () =>
        Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => ({
          index: start + offset,
          key: start + offset,
          start: (start + offset) * size
        })),
      measureElement: (): void => {}
    }
  }
}))

const { JsonTreeView } = await import('./JsonTreeView')

const NESTED_VALUE = { a: { b: 1, c: 2 }, d: 3 }

describe('JsonTreeView', () => {
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
    virtualWindow.range = null
  })

  function mountView(
    result: JsonParseResult,
    options: {
      expansion?: JsonExpansionState
      showLineNumbers?: boolean
      onToggle?: (path: string) => void
      onCopyPath?: (path: string) => void
    } = {}
  ): void {
    act(() => {
      root?.render(
        <JsonTreeView
          result={result}
          expansion={options.expansion ?? createJsonExpansion()}
          showLineNumbers={options.showLineNumbers ?? true}
          onToggle={options.onToggle ?? ((): void => {})}
          onCopyPath={options.onCopyPath ?? ((): void => {})}
        />
      )
    })
  }

  function gutterNumbers(): string[] {
    return Array.from(
      container?.querySelectorAll('[data-testid="json-tree-line-number"]') ?? []
    ).map((node) => node.textContent ?? '')
  }

  function rowCount(): number {
    return container?.querySelectorAll('[data-testid="json-tree-row"]').length ?? 0
  }

  it('prompts for input when nothing has been pasted', () => {
    mountView({ status: 'empty' })
    expect(container?.textContent).toBe('Paste JSON on the left to preview it here.')
    expect(container?.querySelector('.text-muted-foreground')).not.toBeNull()
    expect(rowCount()).toBe(0)
  })

  it('shows the described parse error instead of rows', () => {
    const result: JsonParseResult = {
      status: 'error',
      code: 'invalid-symbol',
      line: 4,
      column: 9
    }
    mountView(result)

    expect(container?.textContent).toBe(describeJsonParseError(result))
    expect(container?.textContent).toContain('4')
    expect(container?.textContent).toContain('9')
    expect(container?.querySelector('.text-destructive')).not.toBeNull()
    expect(rowCount()).toBe(0)
  })

  it('renders one row per visible node and forwards row callbacks', () => {
    const onToggle = vi.fn()
    const onCopyPath = vi.fn()
    mountView({ status: 'ok', value: NESTED_VALUE }, { onToggle, onCopyPath })

    // root, a, a.b, a.c, d
    expect(rowCount()).toBe(5)
    expect(gutterNumbers()).toEqual(['1', '2', '3', '4', '5'])

    const chevrons = Array.from(container?.querySelectorAll('button') ?? []).filter(
      (button) => button.querySelector('svg') !== null
    )
    act(() => chevrons[1]?.click())
    expect(onToggle).toHaveBeenCalledWith('a')

    const valueButtons = Array.from(container?.querySelectorAll('button') ?? []).filter(
      (button) => button.querySelector('svg') === null
    )
    act(() => valueButtons[2]?.click())
    expect(onCopyPath).toHaveBeenCalledWith('a.b')
  })

  it('renumbers line numbers contiguously after a node is collapsed', () => {
    const collapsed = toggleJsonNode(createJsonExpansion(), 'a')
    mountView({ status: 'ok', value: NESTED_VALUE }, { expansion: collapsed })

    // Why: 'a' hides two children, so 'd' must become line 3 — not stay line 5.
    expect(rowCount()).toBe(3)
    expect(gutterNumbers()).toEqual(['1', '2', '3'])
    expect(container?.textContent).not.toContain('"b"')
    expect(container?.textContent).toContain('"d"')
  })

  it('omits the line-number gutter when line numbers are off', () => {
    mountView({ status: 'ok', value: NESTED_VALUE }, { showLineNumbers: false })

    expect(rowCount()).toBe(5)
    expect(gutterNumbers()).toEqual([])
  })

  it('mounts only the virtual window, numbered by absolute position', () => {
    // Why: 5 MiB of accepted input expands to ~10^6 rows, so the whole point is
    // that off-window rows never reach the DOM — and that a windowed row still
    // shows the line number it has in the full list, not its offset within the
    // window.
    virtualWindow.range = { start: 2, end: 3 }
    mountView({ status: 'ok', value: NESTED_VALUE })

    expect(rowCount()).toBe(2)
    expect(gutterNumbers()).toEqual(['3', '4'])
    expect(container?.textContent).toContain('"b"')
    expect(container?.textContent).toContain('"c"')
    // Why: row 0 (root) and row 4 ('d') are outside the window.
    expect(container?.textContent).not.toContain('"d"')
  })

  it('rebuilds rows only when the parsed value or the expansion state changes', () => {
    const expansion = createJsonExpansion()
    mountView({ status: 'ok', value: NESTED_VALUE }, { expansion })
    const afterFirst = rowBuilds.count
    expect(afterFirst).toBeGreaterThan(0)

    // Why: the parent hands down a fresh result object on every keystroke, so
    // memoising on the object would never hit — it has to key on the value.
    mountView({ status: 'ok', value: NESTED_VALUE }, { expansion, showLineNumbers: false })
    expect(rowBuilds.count).toBe(afterFirst)

    mountView({ status: 'ok', value: NESTED_VALUE }, { expansion: toggleJsonNode(expansion, 'a') })
    expect(rowBuilds.count).toBe(afterFirst + 1)
  })

  it('sizes the scroll spacer for every row, not just the mounted ones', () => {
    virtualWindow.range = { start: 0, end: 0 }
    mountView({ status: 'ok', value: NESTED_VALUE })

    expect(rowCount()).toBe(1)
    // Why: 5 rows x the fixed 20px row height — the spacer is what keeps the
    // scrollbar honest while only one row is mounted.
    const spacer = container?.querySelector('[data-testid="json-tree-row"]')?.parentElement
      ?.parentElement
    expect(spacer?.getAttribute('style')).toContain('height: 100px')
  })
})
