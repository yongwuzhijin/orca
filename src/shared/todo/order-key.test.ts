import { describe, expect, it } from 'vitest'
import { FIRST_ORDER_KEY, orderKeyBetween } from './order-key'

describe('orderKeyBetween', () => {
  it('returns FIRST_ORDER_KEY when appending to an empty column', () => {
    expect(orderKeyBetween(null, null)).toBe(FIRST_ORDER_KEY)
  })

  it('returns a key greater than the last when appending to the end', () => {
    const key = orderKeyBetween(FIRST_ORDER_KEY, null)
    expect(key > FIRST_ORDER_KEY).toBe(true)
  })

  it('returns a key less than the first when prepending', () => {
    const key = orderKeyBetween(null, FIRST_ORDER_KEY)
    expect(key < FIRST_ORDER_KEY).toBe(true)
  })

  it('returns a key strictly between two adjacent keys', () => {
    const a = 'a'
    const b = 'b'
    const mid = orderKeyBetween(a, b)
    expect(mid > a).toBe(true)
    expect(mid < b).toBe(true)
  })

  it('produces ascending keys across sequential appends', () => {
    const keys: string[] = []
    let prev: string | null = null
    for (let i = 0; i < 20; i++) {
      const next = orderKeyBetween(prev, null)
      keys.push(next)
      prev = next
    }
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
  })
})
