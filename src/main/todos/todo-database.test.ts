import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
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
    expect(SCHEMA_VERSION).toBe(5)
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

  it('ships schema version 5 with workspace binding columns on a fresh db', () => {
    const d = createDb()
    expect(SCHEMA_VERSION).toBe(5)
    const cols = (d.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('session_id')
    expect(cols).toContain('workspace_project_id')
    expect(cols).toContain('workspace_name')
    expect(cols).toContain('preferred_agent')
  })

  it('adds workspace binding columns to an on-disk legacy v1 db when reopened', () => {
    // Why: Orca uses Electron's built-in node:sqlite (DatabaseSync), not the
    // better-sqlite3 native addon, so the legacy fixture must use the same driver.
    const file = join(mkdtempSync(join(tmpdir(), 'orca-todo-mig-')), 'todo.db')
    const raw = new DatabaseSync(file)
    raw.exec(`CREATE TABLE todo_items (id TEXT PRIMARY KEY, identifier TEXT NOT NULL,
      project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog', priority TEXT NOT NULL DEFAULT 'none',
      scheduled_date TEXT, estimate INTEGER, labels TEXT NOT NULL DEFAULT '[]',
      template_id TEXT, order_key TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);`)
    raw.exec(`CREATE TABLE todo_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      identifier_prefix TEXT NOT NULL, next_sequence INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    raw.exec(`CREATE TABLE todo_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    raw.exec('PRAGMA user_version = 1')
    raw.close()

    // Track on the shared `db` handle so afterEach closes it exactly once.
    db = new TodoDatabase(file)
    const cols = (db.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    const version = db.raw.pragma('user_version', { simple: true }) as number
    expect(cols).toContain('session_id')
    expect(cols).toContain('workspace_project_id')
    expect(cols).toContain('workspace_name')
    expect(cols).toContain('preferred_agent')
    expect(version).toBe(5)
  })

  it('migrates todo_projects with default_working_dir (v3, P2b)', () => {
    const d = createDb()
    const cols = d.raw.pragma('table_info(todo_projects)') as { name: string }[]
    expect(cols.some((c) => c.name === 'default_working_dir')).toBe(true)
    expect(d.raw.pragma('user_version', { simple: true })).toBe(5)
  })

  it('exposes auto_pilot columns on a fresh db', () => {
    const d = createDb()
    const cols = (d.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('auto_pilot_enabled')
    expect(cols).toContain('auto_pilot_max_turns')
  })

  it('adds auto_pilot columns to an on-disk v4 db when reopened', () => {
    // Why: exercise migrate()'s `if (current < 5)` ALTER TABLE branch. A v4 db
    // already carries the workspace binding columns but lacks the autopilot ones,
    // so reopening must add auto_pilot_enabled / auto_pilot_max_turns. Uses the
    // same DatabaseSync fixture as the legacy-v1 test above.
    const file = join(mkdtempSync(join(tmpdir(), 'orca-todo-mig-v5-')), 'todo.db')
    const raw = new DatabaseSync(file)
    raw.exec(`CREATE TABLE todo_items (id TEXT PRIMARY KEY, identifier TEXT NOT NULL,
      project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog', priority TEXT NOT NULL DEFAULT 'none',
      scheduled_date TEXT, estimate INTEGER, labels TEXT NOT NULL DEFAULT '[]',
      template_id TEXT, order_key TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, session_id TEXT,
      workspace_project_id TEXT, workspace_name TEXT, preferred_agent TEXT);`)
    raw.exec(`CREATE TABLE todo_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      identifier_prefix TEXT NOT NULL, next_sequence INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, default_working_dir TEXT);`)
    raw.exec(`CREATE TABLE todo_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    raw.exec('PRAGMA user_version = 4')
    raw.close()

    // Track on the shared `db` handle so afterEach closes it exactly once.
    db = new TodoDatabase(file)
    const cols = (db.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    const version = db.raw.pragma('user_version', { simple: true }) as number
    expect(cols).toContain('auto_pilot_enabled')
    expect(cols).toContain('auto_pilot_max_turns')
    expect(version).toBe(5)
  })
})
