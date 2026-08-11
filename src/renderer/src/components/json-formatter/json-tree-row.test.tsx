// @vitest-environment happy-dom

// Why: the row is where a node's identity (path), its disclosure state and its
// syntax colour all become DOM. Mount it instead of re-reading the JSX.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonTreeRow } from './JsonTreeRow'
import type { JsonTreeRow as JsonTreeRowData } from './json-tree-rows'

function makeRow(overrides: Partial<JsonTreeRowData> = {}): JsonTreeRowData {
  return {
    path: 'a',
    segments: ['a'],
    depth: 1,
    kind: 'string',
    label: 'a',
    labelKind: 'key',
    value: 'hi',
    childCount: 0,
    isExpandable: false,
    isCollapsed: false,
    ...overrides
  }
}

describe('JsonTreeRow', () => {
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

  function mountRow(
    row: JsonTreeRowData,
    options: {
      lineNumber?: number | null
      onToggle?: (path: string) => void
      onCopyPath?: (path: string) => void
    } = {}
  ): void {
    act(() => {
      root?.render(
        <JsonTreeRow
          row={row}
          lineNumber={options.lineNumber ?? null}
          onToggle={options.onToggle ?? ((): void => {})}
          onCopyPath={options.onCopyPath ?? ((): void => {})}
        />
      )
    })
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(container?.querySelectorAll('button') ?? [])
  }

  function valueButton(): HTMLButtonElement {
    const last = buttons().at(-1)
    if (!last) {
      throw new Error('no value button rendered')
    }
    return last
  }

  function valueSpan(): HTMLElement {
    const span = valueButton().lastElementChild
    if (!(span instanceof HTMLElement)) {
      throw new Error('no value span rendered')
    }
    return span
  }

  function chevron(label: string): HTMLButtonElement {
    const node = container?.querySelector(`button[aria-label="${label}"]`)
    if (!(node instanceof HTMLButtonElement)) {
      throw new Error(`no chevron button labelled ${label}`)
    }
    return node
  }

  it('quotes an object key label but leaves an array index bare', () => {
    mountRow(makeRow({ label: 'name', labelKind: 'key' }))
    const keyLabel = valueButton().firstElementChild
    expect(keyLabel?.textContent).toBe('"name"')
    expect(keyLabel?.className).toContain('text-json-key')

    mountRow(makeRow({ label: '2', labelKind: 'index', path: '[2]' }))
    const indexLabel = valueButton().firstElementChild
    expect(indexLabel?.textContent).toBe('2')
    expect(indexLabel?.className).toContain('text-json-punctuation')
  })

  it.each([
    { label: 'a"b', text: '"a\\"b"' },
    { label: 'a\nb', text: '"a\\nb"' },
    { label: 'a\\b', text: '"a\\\\b"' }
  ])('escapes $label in an object key instead of interpolating it raw', ({ label, text }) => {
    mountRow(makeRow({ label, labelKind: 'key' }))
    expect(valueButton().firstElementChild?.textContent).toBe(text)
  })

  it('leaves an index label unstringified so it renders without quotes', () => {
    mountRow(makeRow({ label: '0', labelKind: 'index', path: '[0]' }))
    expect(valueButton().firstElementChild?.textContent).toBe('0')
  })

  it('renders a label-less root row without a key segment', () => {
    mountRow(makeRow({ label: null, labelKind: null, path: '', kind: 'null', value: null }))
    expect(valueButton().textContent).toBe('null')
  })

  it.each([
    { kind: 'string' as const, value: 'hi', text: '"hi"', color: 'text-json-string' },
    { kind: 'number' as const, value: 42, text: '42', color: 'text-json-number' },
    { kind: 'boolean' as const, value: false, text: 'false', color: 'text-json-boolean' },
    { kind: 'null' as const, value: null, text: 'null', color: 'text-json-null' }
  ])('formats a $kind scalar as $text and colours it $color', ({ kind, value, text, color }) => {
    mountRow(makeRow({ kind, value }))
    expect(valueSpan().textContent).toBe(text)
    expect(valueSpan().className).toContain(color)
  })

  it('escapes quotes inside a string value instead of emitting raw text', () => {
    mountRow(makeRow({ kind: 'string', value: 'a"b' }))
    expect(valueSpan().textContent).toBe('"a\\"b"')
  })

  it('summarises a container with its child count and punctuation colour', () => {
    mountRow(makeRow({ kind: 'object', value: {}, childCount: 2, isExpandable: true }))
    expect(valueSpan().textContent).toBe('{ … }  2')
    expect(valueSpan().className).toContain('text-json-punctuation')

    mountRow(makeRow({ kind: 'array', value: [], childCount: 0 }))
    expect(valueSpan().textContent).toBe('[]')
  })

  it('toggles with the row path when the chevron is clicked', () => {
    const onToggle = vi.fn()
    const onCopyPath = vi.fn()
    mountRow(makeRow({ kind: 'object', childCount: 1, isExpandable: true, path: 'a.b' }), {
      onToggle,
      onCopyPath
    })

    act(() => chevron('Collapse node').click())
    expect(onToggle).toHaveBeenCalledWith('a.b')
    expect(onCopyPath).not.toHaveBeenCalled()
  })

  it('copies the raw row path when the value is clicked', () => {
    const onToggle = vi.fn()
    const onCopyPath = vi.fn()
    // Why: '' is the root path, and the row must forward it verbatim — display
    // formatting (toCopyablePath) belongs to the clipboard handler, not here.
    mountRow(makeRow({ path: '', label: null, labelKind: null }), { onToggle, onCopyPath })

    act(() => valueButton().click())
    expect(onCopyPath).toHaveBeenCalledWith('')
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('names the chevron and reports its disclosure state in both directions', () => {
    mountRow(makeRow({ kind: 'object', childCount: 1, isExpandable: true, isCollapsed: true }))
    expect(buttons()).toHaveLength(2)
    expect(chevron('Expand node').getAttribute('aria-expanded')).toBe('false')

    mountRow(makeRow({ kind: 'object', childCount: 1, isExpandable: true, isCollapsed: false }))
    expect(chevron('Collapse node').getAttribute('aria-expanded')).toBe('true')

    // Why: a leaf has nothing to disclose, so it must not offer a named toggle at all.
    mountRow(makeRow({ kind: 'string', isExpandable: false }))
    expect(buttons()).toHaveLength(1)
    expect(container?.querySelector('button[aria-expanded]')).toBeNull()
  })

  it('renders the line-number gutter only when a line number is supplied', () => {
    mountRow(makeRow(), { lineNumber: 7 })
    const gutter = container?.firstElementChild?.firstElementChild
    expect(gutter?.textContent).toBe('7')
    expect(gutter?.className).toContain('text-right')

    mountRow(makeRow(), { lineNumber: null })
    expect(container?.textContent).toBe('"a": "hi"')
    expect(container?.querySelector('.text-right')).toBeNull()
  })

  it('indents by depth', () => {
    mountRow(makeRow({ depth: 3 }))
    const spacer = container?.querySelector('span[style]')
    expect(spacer?.getAttribute('style')).toContain('36px')
  })
})
