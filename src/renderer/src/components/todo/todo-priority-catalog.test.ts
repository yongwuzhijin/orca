import { describe, expect, it } from 'vitest'

import { TODO_PRIORITIES } from '../../../../shared/todo/todo-priority'

import { getTodoPriorityMeta, TODO_PRIORITY_CATALOG } from './todo-priority-catalog'

describe('TODO_PRIORITY_CATALOG', () => {
  it('has one entry per priority, in canonical order', () => {
    expect(TODO_PRIORITY_CATALOG).toHaveLength(TODO_PRIORITIES.length)
    expect(TODO_PRIORITY_CATALOG.map((meta) => meta.id)).toEqual(TODO_PRIORITIES)
  })
})

describe('getTodoPriorityMeta', () => {
  it('returns the entry for a priority', () => {
    const urgent = getTodoPriorityMeta('urgent')
    expect(urgent.id).toBe('urgent')
    expect(urgent.fallbackLabel).toBe('Urgent')
  })
})
