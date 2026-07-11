import type { AcpEngine, AcpSessionRecord, AcpSessionStatus } from '../../shared/acp/acp-session'

export type AcpSessionRow = {
  id: string
  task_id: string
  engine: string
  session_id: string
  cwd: string
  status: string
  stop_reason: string | null
  started_at: string
  ended_at: string | null
  created_at: string
}

export function rowToAcpSession(row: AcpSessionRow): AcpSessionRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    engine: row.engine as AcpEngine,
    sessionId: row.session_id,
    cwd: row.cwd,
    status: row.status as AcpSessionStatus,
    stopReason: row.stop_reason,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at
  }
}
