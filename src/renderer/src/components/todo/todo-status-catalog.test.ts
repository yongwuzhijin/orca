import { describe, expect, it } from 'vitest'

import { isTerminalTodoStatus, TODO_STATUSES } from '../../../../shared/todo/todo-status'

import {
  getTodoStatusMeta,
  getVisibleTodoStatuses,
  TODO_STATUS_CATALOG
} from './todo-status-catalog'

describe('TODO_STATUS_CATALOG', () => {
  it('has exactly one entry per status, in canonical order', () => {
    expect(TODO_STATUS_CATALOG).toHaveLength(TODO_STATUSES.length)
    expect(TODO_STATUS_CATALOG.map((meta) => meta.id)).toEqual(TODO_STATUSES)
  })

  it('has ascending order fields 1..9', () => {
    expect(TODO_STATUS_CATALOG.map((meta) => meta.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('marks terminal statuses consistently with isTerminalTodoStatus', () => {
    for (const meta of TODO_STATUS_CATALOG) {
      expect(meta.terminal).toBe(isTerminalTodoStatus(meta.id))
    }
  })
})

describe('getVisibleTodoStatuses', () => {
  it('returns the default board columns in order', () => {
    expect(getVisibleTodoStatuses().map((meta) => meta.id)).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'human_review',
      'done'
    ])
  })
})

describe('getTodoStatusMeta', () => {
  it('returns the entry for a status', () => {
    const done = getTodoStatusMeta('done')
    expect(done.id).toBe('done')
    expect(done.terminal).toBe(true)
    expect(done.order).toBe(7)
  })
})
