// @vitest-environment happy-dom

// Why: the pane owns two things worth pinning by mounting — which of the three
// parse states it shows, and the fact that a line number is just the visible row
// index + 1 (so collapsing renumbers instead of leaving gaps).

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonTreeView } from './JsonTreeView'
import { describeJsonParseError } from './json-parse-error-message'
import { createJsonExpansion, toggleJsonNode } from './json-tree-expansion'
import type { JsonExpansionState } from './json-tree-expansion'
import type { JsonParseResult } from './parse-json-input'

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
    return Array.from(container?.querySelectorAll('span.w-10') ?? []).map(
      (node) => node.textContent ?? ''
    )
  }

  function rowCount(): number {
    return container?.querySelectorAll('.font-mono').length ?? 0
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
})
