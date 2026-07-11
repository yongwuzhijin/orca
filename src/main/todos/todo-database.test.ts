import { afterEach, describe, expect, it } from 'vitest'
import { TodoDatabase, SCHEMA_VERSION } from './todo-database'

describe('TodoDatabase', () => {
  let db: TodoDatabase | undefined

  afterEach(() => {
    db?.close()
  })

  function createDb(): TodoDatabase {
    db = new TodoDatabase(':memory:')
    return db
  }

  function tableNames(d: TodoDatabase): string[] {
    const rows = d.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[]
    return rows.map((r) => r.name)
  }

  it('creates the three todo tables on construction', () => {
    const d = createDb()
    const names = tableNames(d)
    expect(names).toContain('todo_projects')
    expect(names).toContain('todo_templates')
    expect(names).toContain('todo_items')
  })

  it('sets user_version to SCHEMA_VERSION', () => {
    const d = createDb()
    const version = d.raw.pragma('user_version', { simple: true }) as number
    expect(SCHEMA_VERSION).toBe(1)
    expect(version).toBe(SCHEMA_VERSION)
  })

  it('enables foreign_keys enforcement', () => {
    const d = createDb()
    const fk = d.raw.pragma('foreign_keys', { simple: true }) as number
    expect(fk).toBe(1)
  })

  it('is idempotent across repeated construction (shared in-memory reuse pattern)', () => {
    const first = createDb()
    expect(tableNames(first)).toContain('todo_items')
    first.close()

    // Constructing a second instance must not throw and yields the same schema.
    const second = new TodoDatabase(':memory:')
    db = second
    expect(() => tableNames(second)).not.toThrow()
    expect(tableNames(second)).toContain('todo_items')
    expect(second.raw.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
  })

  it('exposes a usable raw db for statements', () => {
    const d = createDb()
    d.raw
      .prepare(
        `INSERT INTO todo_projects (id, name, identifier_prefix, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run('p1', 'Inbox', 'INB', '2026-01-01', '2026-01-01')
    const row = d.raw.prepare('SELECT * FROM todo_projects WHERE id = ?').get('p1') as {
      name: string
      next_sequence: number
    }
    expect(row.name).toBe('Inbox')
    expect(row.next_sequence).toBe(1)
  })
})
