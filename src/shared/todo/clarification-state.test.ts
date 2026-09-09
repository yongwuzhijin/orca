import { describe, expect, it } from 'vitest'
import { parseClarificationState } from './clarification-state'

describe('parseClarificationState', () => {
  it('parses valid items', () => {
    const result = parseClarificationState({
      items: [{ question: 'Scope unclear?', status: 'open' }]
    })
    expect(result.parseError).toBeNull()
    expect(result.state.items).toHaveLength(1)
    expect(result.state.items[0]?.question).toBe('Scope unclear?')
  })

  it('returns parse error for invalid root', () => {
    const result = parseClarificationState([])
    expect(result.state.items).toEqual([])
    expect(result.parseError).toContain('JSON object')
  })

  it('skips malformed items with warning', () => {
    const result = parseClarificationState({
      items: [{ question: 'OK' }, { context: 'missing question' }]
    })
    expect(result.state.items).toHaveLength(1)
    expect(result.parseError).toContain('skipped')
  })
})
