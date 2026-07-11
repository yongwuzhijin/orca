import Database from '../sqlite/sync-database'

// 独立执行域库,版本与 todo.db 各自独立;迁移骨架仿 TodoDatabase。
export const ACP_SCHEMA_VERSION = 1

export class AcpSessionDatabase {
  private db: Database.Database

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.ensureSchema()
    this.migrate()
  }

  get raw(): Database.Database {
    return this.db
  }

  private ensureSchema(): void {
    const fresh = (this.db.pragma('user_version', { simple: true }) as number) === 0
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS acp_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        engine TEXT NOT NULL,
        session_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        stop_reason TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_acp_sessions_task_id ON acp_sessions(task_id);
    `)
    if (fresh) {
      this.db.pragma(`user_version = ${ACP_SCHEMA_VERSION}`)
    }
  }

  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number
    if (current >= ACP_SCHEMA_VERSION) {
      return
    }
    this.db.exec('BEGIN')
    try {
      // 未来列新增在此,hasColumn 守护。
      this.db.pragma(`user_version = ${ACP_SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.db.close()
  }
}
