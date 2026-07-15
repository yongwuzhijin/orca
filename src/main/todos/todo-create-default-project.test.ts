import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_TODO_PROJECT_ID } from '../../shared/todo/todo-default-project'
import { TodoDatabase } from './todo-database'
import { TodoRepository } from './todo-repository'

describe('createItem vs locked default project', () => {
  let db: TodoDatabase | undefined

  afterEach(() => {
    db?.close()
  })

  it('ensures todo-default exists when creating against it without a prior list', () => {
    db = new TodoDatabase(':memory:')
    const repo = new TodoRepository(db)
    const item = repo.createItem({
      projectId: DEFAULT_TODO_PROJECT_ID,
      title: '生成CLAUDE.md',
      preferredAgent: 'claude',
      status: 'backlog',
      scheduledDate: '2026-07-14'
    })
    expect(item.identifier).toBe('TODO-1')
    expect(item.projectId).toBe(DEFAULT_TODO_PROJECT_ID)
  })

  it('still succeeds after listProjects ensures the default', () => {
    db = new TodoDatabase(':memory:')
    const repo = new TodoRepository(db)
    repo.listProjects()
    const item = repo.createItem({
      projectId: DEFAULT_TODO_PROJECT_ID,
      title: 'second'
    })
    expect(item.identifier).toBe('TODO-1')
  })
})
