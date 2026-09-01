import { orderKeyBetween } from '../../shared/todo/order-key'
import Database from '../sqlite/sync-database'

// Why: dedicated todo.db versioning mirrors OrchestrationDb so on-disk upgrades
// migrate explicitly (CREATE TABLE IF NOT EXISTS is a no-op against an existing
// DB). v2 adds todo_items.session_id, the pointer to the ACP execution session.
// v3 adds todo_projects.default_working_dir, the project-level default cwd.
// v4 adds workspace binding fields on todo_items for create-task → start-session.
// v5 adds auto_pilot_enabled / auto_pilot_max_turns on todo_items for the orchestrator.
// v6 folds the redundant 'backlog' status into 'todo' and adds
// design_stage_enabled, the per-card opt-in for the solution-design stage.
// v8 adds prd_link and execution_mode on todo_items for requirement metadata and start-time routing.
// v9 adds bound_worktree_id so the sidebar requirements list and detail meta can resolve the workspace.
export const SCHEMA_VERSION = 9

export class TodoDatabase {
  private db: Database.Database

  constructor(dbPath: (string & {}) | ':memory:') {
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
        status TEXT NOT NULL DEFAULT 'todo',
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
        session_id TEXT,
        workspace_project_id TEXT,
        workspace_name TEXT,
        preferred_agent TEXT,
        auto_pilot_enabled INTEGER NOT NULL DEFAULT 0,
        auto_pilot_max_turns INTEGER,
        design_stage_enabled INTEGER NOT NULL DEFAULT 0,
        workspace_project_ids TEXT,
        prd_link TEXT,
        execution_mode TEXT,
        bound_worktree_id TEXT
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
  // re-invocation short-circuits once current >= SCHEMA_VERSION.
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
      // v4: workspace project / name / agent selected at task creation.
      if (current < 4) {
        if (!this.hasColumn('todo_items', 'workspace_project_id')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN workspace_project_id TEXT')
        }
        if (!this.hasColumn('todo_items', 'workspace_name')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN workspace_name TEXT')
        }
        if (!this.hasColumn('todo_items', 'preferred_agent')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN preferred_agent TEXT')
        }
      }
      // v5: orchestrator eligibility + per-task turn cap.
      if (current < 5) {
        if (!this.hasColumn('todo_items', 'auto_pilot_enabled')) {
          this.db.exec(
            'ALTER TABLE todo_items ADD COLUMN auto_pilot_enabled INTEGER NOT NULL DEFAULT 0'
          )
        }
        if (!this.hasColumn('todo_items', 'auto_pilot_max_turns')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN auto_pilot_max_turns INTEGER')
        }
      }
      // v6: 'backlog' folded into 'todo'; per-card solution-design opt-in.
      if (current < 6) {
        this.foldBacklogIntoTodo()
        if (!this.hasColumn('todo_items', 'design_stage_enabled')) {
          this.db.exec(
            'ALTER TABLE todo_items ADD COLUMN design_stage_enabled INTEGER NOT NULL DEFAULT 0'
          )
        }
      }
      // v7: multi-project workspace binding at task creation.
      if (current < 7 && !this.hasColumn('todo_items', 'workspace_project_ids')) {
        this.db.exec('ALTER TABLE todo_items ADD COLUMN workspace_project_ids TEXT')
        this.db.exec(
          `UPDATE todo_items SET workspace_project_ids = json_array(workspace_project_id)
           WHERE workspace_project_id IS NOT NULL
             AND (workspace_project_ids IS NULL OR workspace_project_ids = '')`
        )
      }
      // v8: PRD link at create; execution mode recorded at start.
      if (current < 8) {
        if (!this.hasColumn('todo_items', 'prd_link')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN prd_link TEXT')
        }
        if (!this.hasColumn('todo_items', 'execution_mode')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN execution_mode TEXT')
        }
      }
      // v9: worktree created when the requirement starts.
      if (current < 9 && !this.hasColumn('todo_items', 'bound_worktree_id')) {
        this.db.exec('ALTER TABLE todo_items ADD COLUMN bound_worktree_id TEXT')
      }
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  // Why: order_key was scoped per (project, status), so backlog and todo each
  // walked the same sequence from FIRST_ORDER_KEY. A bare status flip leaves exact
  // ties that orderKeyBetween() rejects on the next drag, so re-append each moved
  // card after the project's todo tail instead. Iterative by necessity — a
  // correlated-subquery UPDATE would read the rows it is mutating.
  private foldBacklogIntoTodo(): void {
    const moved = this.db
      .prepare(
        `SELECT id, project_id FROM todo_items
         WHERE status = 'backlog' ORDER BY project_id, order_key`
      )
      .all() as { id: string; project_id: string }[]
    const rekey = this.db.prepare(
      "UPDATE todo_items SET status = 'todo', order_key = ? WHERE id = ?"
    )
    const readTail = this.db.prepare(
      `SELECT MAX(order_key) AS k FROM todo_items
       WHERE project_id = ? AND status = 'todo'`
    )
    const tails = new Map<string, string | null>()
    for (const row of moved) {
      const tail = tails.has(row.project_id)
        ? tails.get(row.project_id)!
        : (readTail.get(row.project_id) as { k: string | null }).k
      const key = orderKeyBetween(tail, null)
      rekey.run(key, row.id)
      tails.set(row.project_id, key)
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
