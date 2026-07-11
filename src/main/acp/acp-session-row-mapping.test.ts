import { describe, expect, it } from 'vitest'
import { rowToAcpSession, type AcpSessionRow } from './acp-session-row-mapping'

describe('rowToAcpSession', () => {
  it('maps snake_case row to camelCase record', () => {
    const row: AcpSessionRow = {
      id: 'r1',
      task_id: 't1',
      engine: 'claude',
      session_id: 's1',
      cwd: '/w',
      status: 'running',
      stop_reason: null,
      started_at: '2026-07-11T00:00:00.000Z',
      ended_at: null,
      created_at: '2026-07-11T00:00:00.000Z'
    }
    expect(rowToAcpSession(row)).toEqual({
      id: 'r1',
      taskId: 't1',
      engine: 'claude',
      sessionId: 's1',
      cwd: '/w',
      status: 'running',
      stopReason: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      endedAt: null,
      createdAt: '2026-07-11T00:00:00.000Z'
    })
  })
})
