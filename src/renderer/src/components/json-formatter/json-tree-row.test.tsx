// @vitest-environment happy-dom

// Why: the row is where a node's identity (path), its disclosure state, its
// syntax colour and its search hits all become DOM. Mount it instead of
// re-reading the JSX.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JsonTreeRow } from './JsonTreeRow'
import type { JsonSearchMatch } from './json-search'
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

const handlers = {
  onToggle: vi.fn(),
  onCopyPair: vi.fn(),
  onCopyPath: vi.fn(),
  onCopyValue: vi.fn(),
  onDelete: vi.fn()
}

describe('JsonTreeRow', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    for (const handler of Object.values(handlers)) {
      handler.mockReset()
    }
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
      query?: string
      activeMatch?: JsonSearchMatch | null
    } = {}
  ): void {
    act(() => {
      root?.render(
        <JsonTreeRow
          row={row}
          lineNumber={options.lineNumber ?? null}
          query={options.query ?? ''}
          activeMatch={options.activeMatch ?? null}
          onToggle={handlers.onToggle}
          actions={{
            onCopyPair: handlers.onCopyPair,
            onCopyPath: handlers.onCopyPath,
            onCopyValue: handlers.onCopyValue,
            onDelete: handlers.onDelete
          }}
        />
      )
    })
  }

  function valueArea(): HTMLElement {
    const node = container?.querySelector<HTMLElement>('.min-w-0')
    if (!node) {
      throw new Error('no value area rendered')
    }
    return node
  }

  function valueSpan(): HTMLElement {
    const span = valueArea().lastElementChild
    if (!(span instanceof HTMLElement)) {
      throw new Error('no value span rendered')
    }
    return span
  }

  function actionButton(label: string): HTMLButtonElement {
    const found = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (!found) {
      throw new Error(`no button labelled ${label}`)
    }
    return found
  }

  function highlights(): HTMLElement[] {
    return [...(container?.querySelectorAll<HTMLElement>('[data-testid="json-highlight"]') ?? [])]
  }

  it('quotes an object key label but leaves an array index bare', () => {
    mountRow(makeRow({ label: 'name', labelKind: 'key' }))
    const keyLabel = valueArea().firstElementChild
    expect(keyLabel?.textContent).toBe('"name"')
    expect(keyLabel?.className).toContain('text-json-key')

    mountRow(makeRow({ label: '2', labelKind: 'index', path: '[2]' }))
    const indexLabel = valueArea().firstElementChild
    expect(indexLabel?.textContent).toBe('2')
    expect(indexLabel?.className).toContain('text-json-punctuation')
  })

  it.each([
    { label: 'a"b', text: '"a\\"b"' },
    { label: 'a\nb', text: '"a\\nb"' },
    { label: 'a\\b', text: '"a\\\\b"' }
  ])('escapes $label in an object key instead of interpolating it raw', ({ label, text }) => {
    mountRow(makeRow({ label, labelKind: 'key' }))
    expect(valueArea().firstElementChild?.textContent).toBe(text)
  })

  it('leaves an index label unstringified so it renders without quotes', () => {
    mountRow(makeRow({ label: '0', labelKind: 'index', path: '[0]' }))
    expect(valueArea().firstElementChild?.textContent).toBe('0')
  })

  it('renders a label-less root row without a key segment', () => {
    mountRow(makeRow({ label: null, labelKind: null, path: '', kind: 'null', value: null }))
    expect(valueArea().textContent).toBe('null')
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
    mountRow(makeRow({ kind: 'object', childCount: 1, isExpandable: true, path: 'a.b' }))

    act(() => actionButton('Collapse node').click())
    expect(handlers.onToggle).toHaveBeenCalledWith('a.b')
    expect(handlers.onCopyPath).not.toHaveBeenCalled()
  })

  it('names the chevron and reports its disclosure state in both directions', () => {
    mountRow(makeRow({ kind: 'object', childCount: 2, isExpandable: true, isCollapsed: true }))
    expect(actionButton('Expand node').getAttribute('aria-expanded')).toBe('false')

    mountRow(makeRow({ kind: 'object', childCount: 2, isExpandable: true, isCollapsed: false }))
    expect(actionButton('Collapse node').getAttribute('aria-expanded')).toBe('true')
  })

  it('omits the chevron for leaf rows', () => {
    // Why: a leaf has nothing to disclose, so it must not offer a named toggle at all.
    mountRow(makeRow())
    expect(container?.querySelector('button[aria-label="Expand node"]')).toBeNull()
    expect(container?.querySelector('button[aria-label="Collapse node"]')).toBeNull()
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

  it('renders at the 13px/22px scale the virtual list assumes', () => {
    mountRow(makeRow())
    const root = container?.querySelector<HTMLElement>('[data-testid="json-tree-row"]')
    expect(root?.className).toContain('text-[13px]')
    expect(root?.className).toContain('leading-[22px]')
  })

  describe('row actions', () => {
    it('no longer turns the value area into a button', () => {
      mountRow(makeRow())
      expect(container?.querySelector('button[aria-label="Copy path"]')).not.toBeNull()
      for (const button of container?.querySelectorAll('button') ?? []) {
        expect(button.textContent).toBe('')
      }
    })

    it('routes the row-end buttons to their handlers', () => {
      const row = makeRow()
      mountRow(row)
      act(() => actionButton('Copy').click())
      act(() => actionButton('Copy path').click())
      act(() => actionButton('Copy value').click())
      act(() => actionButton('Delete node').click())
      expect(handlers.onCopyPair).toHaveBeenCalledWith(row)
      expect(handlers.onCopyPath).toHaveBeenCalledWith('a')
      expect(handlers.onCopyValue).toHaveBeenCalledWith(row)
      expect(handlers.onDelete).toHaveBeenCalledWith(row)
    })
  })

  describe('search highlighting', () => {
    it('highlights hits in the key and the value', () => {
      mountRow(makeRow({ label: 'code', value: 'coder' }), { query: 'cod' })
      expect(highlights().map((mark) => mark.textContent)).toEqual(['cod', 'cod'])
    })

    it('marks only the active field as the current hit', () => {
      mountRow(makeRow({ label: 'code', value: 'coder' }), {
        query: 'cod',
        activeMatch: { path: 'a', field: 'value', start: 1, end: 4 }
      })
      const [keyHit, valueHit] = highlights()
      expect(keyHit?.className).toContain('bg-search-match/50')
      expect(valueHit?.className).toContain('bg-search-match-active/60')
    })

    it('never highlights inside a container summary', () => {
      mountRow(makeRow({ kind: 'object', label: 'data', childCount: 8, value: {} }), {
        query: '8'
      })
      expect(highlights()).toHaveLength(0)
    })

    it('renders no highlight spans without a query', () => {
      mountRow(makeRow())
      expect(highlights()).toHaveLength(0)
    })
  })
})
