import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TODO_PROJECT_ID,
  resolveLockedTodoActiveProjectId
} from '../../../../shared/todo/todo-default-project'

describe('resolveLockedTodoActiveProjectId', () => {
  it('always returns the built-in default project id', () => {
    expect(resolveLockedTodoActiveProjectId()).toBe(DEFAULT_TODO_PROJECT_ID)
  })
})
