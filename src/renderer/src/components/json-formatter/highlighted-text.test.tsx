// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { HighlightedText } = await import('./HighlightedText')

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  container.remove()
})

function render(node: React.JSX.Element): void {
  act(() => {
    createRoot(container).render(node)
  })
}

function marks(): HTMLElement[] {
  return [...container.querySelectorAll('[data-testid="json-highlight"]')] as HTMLElement[]
}

describe('HighlightedText', () => {
  it('renders plain text when there are no ranges', () => {
    render(<HighlightedText text="abcdef" ranges={[]} activeRange={null} />)
    expect(container.textContent).toBe('abcdef')
    expect(marks()).toHaveLength(0)
  })

  it('wraps every range and preserves the full text', () => {
    render(
      <HighlightedText
        text="abcabc"
        ranges={[
          { start: 0, end: 3 },
          { start: 3, end: 6 }
        ]}
        activeRange={null}
      />
    )
    expect(container.textContent).toBe('abcabc')
    expect(marks().map((mark) => mark.textContent)).toEqual(['abc', 'abc'])
  })

  it('keeps the gaps and the tail around a middle range', () => {
    render(<HighlightedText text="xxabcyy" ranges={[{ start: 2, end: 5 }]} activeRange={null} />)
    expect(container.textContent).toBe('xxabcyy')
    expect(marks()).toHaveLength(1)
    expect(marks()[0]?.textContent).toBe('abc')
  })

  it('styles only the active range differently', () => {
    render(
      <HighlightedText
        text="abcabc"
        ranges={[
          { start: 0, end: 3 },
          { start: 3, end: 6 }
        ]}
        activeRange={{ start: 3, end: 6 }}
      />
    )
    const [first, second] = marks()
    expect(first?.className).toContain('bg-search-match/50')
    expect(second?.className).toContain('bg-search-match-active/60')
  })
})
