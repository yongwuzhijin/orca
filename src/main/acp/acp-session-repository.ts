import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import type {
  AcpSessionRecord,
  AcpSessionStatus,
  CreateAcpSessionInput
} from '../../shared/acp/acp-session'
import type { AcpSessionDatabase } from './acp-session-database'
import { rowToAcpSession, type AcpSessionRow } from './acp-session-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

export class AcpSessionRepository {
  private readonly db: Database.Database

  constructor(database: AcpSessionDatabase) {
    this.db = database.raw
  }

  create(input: CreateAcpSessionInput): AcpSessionRecord {
    const id = randomUUID()
    const timestamp = nowIso()
    this.db
      .prepare(
        `INSERT INTO acp_sessions
          (id, task_id, engine, session_id, cwd, status, stop_reason, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'running', NULL, ?, NULL, ?)`
      )
      .run(id, input.taskId, input.engine, input.sessionId, input.cwd, timestamp, timestamp)
    return this.requireById(id)
  }

  getBySessionId(sessionId: string): AcpSessionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM acp_sessions WHERE session_id = ?')
      .get(sessionId) as AcpSessionRow | undefined
    return row ? rowToAcpSession(row) : null
  }

  listByTask(taskId: string): AcpSessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM acp_sessions WHERE task_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(taskId) as AcpSessionRow[]
    return rows.map(rowToAcpSession)
  }

  finish(
    sessionId: string,
    status: AcpSessionStatus,
    stopReason: string | null
  ): AcpSessionRecord | null {
    this.db
      .prepare(
        'UPDATE acp_sessions SET status = ?, stop_reason = ?, ended_at = ? WHERE session_id = ?'
      )
      .run(status, stopReason, nowIso(), sessionId)
    return this.getBySessionId(sessionId)
  }

  private requireById(id: string): AcpSessionRecord {
    const row = this.db.prepare('SELECT * FROM acp_sessions WHERE id = ?').get(id) as
      | AcpSessionRow
      | undefined
    if (!row) {
      throw new Error(`AcpSessionRepository: record not found: ${id}`)
    }
    return rowToAcpSession(row)
  }
}
