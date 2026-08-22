// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { EditorProps } from '@monaco-editor/react'

const editorProps: EditorProps[] = []

// Why: the real module pulls monaco plus five workers and a CSS file, none of which happy-dom can
// load, and the props handed to Editor are the whole contract of this wrapper.
vi.mock('@/lib/monaco-setup', () => ({}))
vi.mock('@monaco-editor/react', () => ({
  default: (props: EditorProps) => {
    editorProps.push(props)
    return <div data-testid="editor" />
  }
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ settings: { theme: 'light', terminalFontSize: 13 }, editorFontZoomLevel: 0 })
}))

import { JsonFormatterInput } from './JsonFormatterInput'

afterEach(() => {
  cleanup()
  editorProps.length = 0
})

function lastProps(): EditorProps {
  const props = editorProps.at(-1)
  if (!props) {
    throw new Error('Editor was never rendered')
  }
  return props
}

describe('JsonFormatterInput', () => {
  it('edits JSON by default', () => {
    render(<JsonFormatterInput value="{}" onChange={vi.fn()} />)

    expect(lastProps().language).toBe('json')
    expect(lastProps().options?.readOnly).toBe(false)
    expect(lastProps().options?.domReadOnly).toBe(false)
  })

  // Why: readOnly on its own still lets Monaco's hidden textarea take focus and swallow the
  // drawer's key handling, so the viewer has to opt out of the DOM typing path too.
  it('keeps a read-only editor out of the typing path', () => {
    render(<JsonFormatterInput value="{}" readOnly />)

    expect(lastProps().options?.readOnly).toBe(true)
    expect(lastProps().options?.domReadOnly).toBe(true)
  })

  it('honors a non-JSON language so the viewer can show any response', () => {
    render(<JsonFormatterInput value="<html />" language="html" readOnly />)

    expect(lastProps().language).toBe('html')
  })

  // Why: the response viewer passes no onChange at all, and Monaco still fires the callback on
  // programmatic value changes, so an unguarded call would crash the drawer.
  it('survives an edit notification with no onChange supplied', () => {
    render(<JsonFormatterInput value="{}" readOnly />)

    expect(() => lastProps().onChange?.('next', {} as never)).not.toThrow()
  })

  it('reports a cleared editor as an empty string rather than undefined', () => {
    const onChange = vi.fn<(value: string) => void>()
    render(<JsonFormatterInput value="{}" onChange={onChange} />)

    lastProps().onChange?.(undefined, {} as never)

    expect(onChange).toHaveBeenCalledWith('')
  })
})
