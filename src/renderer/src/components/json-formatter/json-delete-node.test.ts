import { describe, expect, it } from 'vitest'
import { deleteJsonNodeAt } from './json-delete-node'

describe('deleteJsonNodeAt', () => {
  it('removes an object key', () => {
    expect(deleteJsonNodeAt({ a: 1, b: 2 }, ['b'])).toEqual({ a: 1 })
  })

  it('removes a nested object key', () => {
    expect(deleteJsonNodeAt({ data: { a: 1, b: 2 } }, ['data', 'b'])).toEqual({
      data: { a: 1 }
    })
  })

  it('splices an array element so later siblings shift down', () => {
    expect(deleteJsonNodeAt({ list: [10, 20, 30] }, ['list', 1])).toEqual({
      list: [10, 30]
    })
  })

  it('removes a key nested under an array element', () => {
    expect(deleteJsonNodeAt({ data: [{ a: 1, b: 2 }] }, ['data', 0, 'b'])).toEqual({
      data: [{ a: 1 }]
    })
  })

  it('leaves the input untouched', () => {
    const original = { data: [{ a: 1, b: 2 }] }
    const next = deleteJsonNodeAt(original, ['data', 0, 'b'])
    expect(original).toEqual({ data: [{ a: 1, b: 2 }] })
    expect(next).not.toBe(original)
  })

  it('handles keys that look like path syntax', () => {
    expect(deleteJsonNodeAt({ 'a.b': 1, c: 2 }, ['a.b'])).toEqual({ c: 2 })
  })

  it('throws for the root node', () => {
    expect(() => deleteJsonNodeAt({ a: 1 }, [])).toThrow(/root/)
  })
})
