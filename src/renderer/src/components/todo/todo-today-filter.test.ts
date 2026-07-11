import { describe, expect, it } from 'vitest'

import { isTodoDueToday, localTodayIso } from './todo-today-filter'

describe('localTodayIso', () => {
  it('formats a local date as YYYY-MM-DD (month is 0-indexed)', () => {
    expect(localTodayIso(new Date(2026, 6, 11))).toBe('2026-07-11')
  })

  it('zero-pads single-digit months and days', () => {
    expect(localTodayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('isTodoDueToday', () => {
  it('shows unscheduled items (null scheduledDate)', () => {
    expect(isTodoDueToday({ scheduledDate: null })).toBe(true)
  })

  it('shows items due today', () => {
    expect(isTodoDueToday({ scheduledDate: '2026-07-11' }, '2026-07-11')).toBe(true)
  })

  it('shows overdue items', () => {
    expect(isTodoDueToday({ scheduledDate: '2026-07-01' }, '2026-07-11')).toBe(true)
  })

  it('hides future items', () => {
    expect(isTodoDueToday({ scheduledDate: '2026-07-20' }, '2026-07-11')).toBe(false)
  })
})
