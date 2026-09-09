import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { orderKeyBetween } from '../../shared/todo/order-key'
import { TodoDatabase, SCHEMA_VERSION } from './todo-database'

describe('TodoDatabase', () => {
  let db: TodoDatabase | undefined

  afterEach(() => {
    // Why: close() on an already-closed handle throws, so drop the reference —
    // tests that close their own handle must not poison teardown.
    db?.close()
    db = undefined
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
    expect(SCHEMA_VERSION).toBe(10)
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

  it('ships schema version 10 with workspace binding columns on a fresh db', () => {
    const d = createDb()
    expect(SCHEMA_VERSION).toBe(10)
    const cols = (d.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('session_id')
    expect(cols).toContain('workspace_project_id')
    expect(cols).toContain('workspace_name')
    expect(cols).toContain('preferred_agent')
    // Why: without this, dropping the column from CREATE TABLE still passes the
    // suite while every new install breaks on first insert — and ensureSchema has
    // already stamped user_version = 6, so migrate() can never repair it.
    expect(cols).toContain('design_stage_enabled')
    expect(cols).toContain('workspace_project_ids')
    expect(cols).toContain('prd_link')
    expect(cols).toContain('execution_mode')
    expect(cols).toContain('bound_worktree_id')
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
    raw.exec(`INSERT INTO todo_items (id, identifier, project_id, title, status, order_key,
      created_at, updated_at) VALUES ('l1', 'L-1', 'p1', 'staged', 'backlog', 'i', 'now', 'now');`)
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
    // Why: a `current === 5` guard would leave this db stamped v6 with the column
    // missing — unrecoverable. Pre-v5 dbs must take the v6 step too.
    expect(cols).toContain('design_stage_enabled')
    expect(cols).toContain('workspace_project_ids')
    expect(db.raw.prepare('SELECT status FROM todo_items WHERE id = ?').get('l1')).toEqual({
      status: 'todo'
    })
    expect(version).toBe(10)
  })

  it('migrates todo_projects with default_working_dir (v3, P2b)', () => {
    const d = createDb()
    const cols = d.raw.pragma('table_info(todo_projects)') as { name: string }[]
    expect(cols.some((c) => c.name === 'default_working_dir')).toBe(true)
    expect(d.raw.pragma('user_version', { simple: true })).toBe(10)
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
    raw.exec(`INSERT INTO todo_items (id, identifier, project_id, title, status, order_key,
      created_at, updated_at) VALUES ('v4a', 'V-1', 'p1', 'staged', 'backlog', 'i', 'now', 'now');`)
    raw.exec('PRAGMA user_version = 4')
    raw.close()

    // Track on the shared `db` handle so afterEach closes it exactly once.
    db = new TodoDatabase(file)
    const cols = (db.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    const version = db.raw.pragma('user_version', { simple: true }) as number
    expect(cols).toContain('auto_pilot_enabled')
    expect(cols).toContain('auto_pilot_max_turns')
    // Why: pre-v5 dbs must also take the v6 step, else they land stamped v6 with
    // design_stage_enabled missing and no path back.
    expect(cols).toContain('design_stage_enabled')
    expect(cols).toContain('workspace_project_ids')
    expect(db.raw.prepare('SELECT status FROM todo_items WHERE id = ?').get('v4a')).toEqual({
      status: 'todo'
    })
    expect(version).toBe(10)
  })

  // Returns the path to an on-disk v5 db whose todo_items holds `itemValues`
  // (a VALUES tail for id, identifier, project_id, title, status, order_key).
  function createV5DbFile(prefix: string, itemValues: string): string {
    const file = join(mkdtempSync(join(tmpdir(), prefix)), 'todo.db')
    const raw = new DatabaseSync(file)
    raw.exec(`
      CREATE TABLE todo_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        identifier_prefix TEXT NOT NULL,
        next_sequence INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        default_working_dir TEXT
      );
      CREATE TABLE todo_items (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'none',
        scheduled_date TEXT,
        estimate INTEGER,
        labels TEXT NOT NULL DEFAULT '[]',
        template_id TEXT,
        order_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        session_id TEXT,
        workspace_project_id TEXT,
        workspace_name TEXT,
        preferred_agent TEXT,
        auto_pilot_enabled INTEGER NOT NULL DEFAULT 0,
        auto_pilot_max_turns INTEGER
      );
      INSERT INTO todo_projects (id, name, identifier_prefix, next_sequence, created_at, updated_at)
        VALUES ('p1', 'Proj', 'P', 3, 'now', 'now');
      INSERT INTO todo_items (id, identifier, project_id, title, status, order_key, created_at, updated_at)
        VALUES ${itemValues};
    `)
    raw.exec('PRAGMA user_version = 5')
    raw.close()
    return file
  }

  it('migrates v5 to v6: backfills backlog rows and adds design_stage_enabled', () => {
    const file = createV5DbFile(
      'orca-todo-mig-v6-',
      `('a', 'P-1', 'p1', 'staged', 'backlog', 'a0', 'now', 'now'),
       ('b', 'P-2', 'p1', 'ready', 'todo', 'a1', 'now', 'now'),
       ('c', 'P-3', 'p1', 'shipped', 'done', 'a2', 'now', 'now')`
    )

    db = new TodoDatabase(file)

    expect(db.raw.pragma('user_version', { simple: true })).toBe(10)
    const cols = (db.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('design_stage_enabled')
    expect(
      db.raw.prepare('SELECT id, status, design_stage_enabled FROM todo_items ORDER BY id').all()
    ).toEqual([
      { id: 'a', status: 'todo', design_stage_enabled: 0 },
      { id: 'b', status: 'todo', design_stage_enabled: 0 },
      { id: 'c', status: 'done', design_stage_enabled: 0 }
    ])

    // Why: re-opening must be a no-op — migrate() short-circuits on user_version.
    db.close()
    db = new TodoDatabase(file)
    expect(db.raw.pragma('user_version', { simple: true })).toBe(10)
    expect(
      db.raw.prepare('SELECT COUNT(*) AS n FROM todo_items WHERE status = ?').get('todo')
    ).toEqual({ n: 2 })
  })

  it('rekeys folded backlog rows so order_key stays unique within a project', () => {
    // Why: order_key was scoped per (project, status), so backlog and todo each
    // walked the same sequence from FIRST_ORDER_KEY. A bare status flip leaves
    // exact ties, and the next drag calls orderKeyBetween(k, k), which throws.
    const file = createV5DbFile(
      'orca-todo-mig-v6-keys-',
      `('a', 'P-1', 'p1', 'staged', 'backlog', 'i', 'now', 'now'),
       ('b', 'P-2', 'p1', 'ready', 'todo', 'i', 'now', 'now'),
       ('c', 'P-3', 'p2', 'other project', 'backlog', 'i', 'now', 'now')`
    )

    db = new TodoDatabase(file)

    const p1 = db.raw
      .prepare(
        `SELECT id, status, order_key FROM todo_items
         WHERE project_id = 'p1' ORDER BY order_key`
      )
      .all() as { id: string; status: string; order_key: string }[]
    expect(p1.map((r) => r.status)).toEqual(['todo', 'todo'])
    // Pre-existing todo card keeps its place; the ex-backlog card appends after it.
    expect(p1.map((r) => r.id)).toEqual(['b', 'a'])
    expect(p1[0].order_key).not.toBe(p1[1].order_key)
    expect(() => orderKeyBetween(p1[0].order_key, p1[1].order_key)).not.toThrow()

    // Per-project scoping: p2's only card needs no rekey away from 'i'.
    expect(db.raw.prepare("SELECT status, order_key FROM todo_items WHERE id = 'c'").get()).toEqual(
      { status: 'todo', order_key: 'i' }
    )
  })
})
