import Database from '../sqlite/sync-database'

// Why: dedicated todo.db versioning mirrors OrchestrationDb so on-disk upgrades
// migrate explicitly (CREATE TABLE IF NOT EXISTS is a no-op against an existing
// DB). v2 adds todo_items.session_id, the pointer to the ACP execution session.
// v3 adds todo_projects.default_working_dir, the project-level default cwd.
export const SCHEMA_VERSION = 3

export class TodoDatabase {
  private db: Database.Database

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    // Why: foreign_keys is per-connection and OFF by default in SQLite, so the
    // ON DELETE CASCADE / SET NULL constraints on todo_items only fire when this
    // is set before any FK-dependent statement runs.
    this.db.pragma('foreign_keys = ON')
    this.ensureSchema()
    this.migrate()
  }

  get raw(): Database.Database {
    return this.db
  }

  private ensureSchema(): void {
    const fresh = (this.db.pragma('user_version', { simple: true }) as number) === 0
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todo_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        identifier_prefix TEXT NOT NULL,
        next_sequence INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        default_working_dir TEXT
      );

      CREATE TABLE IF NOT EXISTS todo_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todo_items (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES todo_projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'none',
        scheduled_date TEXT,
        estimate INTEGER,
        labels TEXT NOT NULL DEFAULT '[]',
        template_id TEXT REFERENCES todo_templates(id) ON DELETE SET NULL,
        order_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        session_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_todo_items_project_status
        ON todo_items(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_todo_items_scheduled
        ON todo_items(scheduled_date);
    `)

    // Why: guard against a partially-created schema (e.g. an interrupted DDL on
    // an older build) — order_key is NOT NULL and load-bearing for board sort,
    // so fail loudly here rather than at first insert.
    if (!this.hasColumn('todo_items', 'order_key')) {
      throw new Error('todo_items schema is missing order_key column')
    }

    // Why: stamp the version on a brand-new DB so migrate() short-circuits and
    // future upgrades can tell a fresh v1 DB from a pre-versioned legacy one.
    if (fresh) {
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
    }
  }

  // Why: transactional gate for future column additions. user_version is bumped
  // only on success so a mid-migration crash leaves the DB at the prior version;
  // re-invocation short-circuits once current >= SCHEMA_VERSION. P1 has no
  // historical steps yet — the skeleton keeps the upgrade path ready.
  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number
    if (current >= SCHEMA_VERSION) {
      return
    }

    this.db.exec('BEGIN')
    try {
      // v2: session_id points a todo item at its ACP execution session.
      if (current < 2 && !this.hasColumn('todo_items', 'session_id')) {
        this.db.exec('ALTER TABLE todo_items ADD COLUMN session_id TEXT')
      }
      // v3: 项目级默认工作目录,新任务继承 / 启动弹窗预填。
      if (current < 3 && !this.hasColumn('todo_projects', 'default_working_dir')) {
        this.db.exec('ALTER TABLE todo_projects ADD COLUMN default_working_dir TEXT')
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.db.pragma(`table_info(${table})`) as { name: string }[]
    return rows.some((r) => r.name === column)
  }

  close(): void {
    this.db.close()
  }
}
