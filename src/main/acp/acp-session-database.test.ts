import { afterEach, describe, expect, it } from 'vitest'
import { AcpSessionDatabase, ACP_SCHEMA_VERSION } from './acp-session-database'

describe('AcpSessionDatabase', () => {
  let db: AcpSessionDatabase | undefined
  afterEach(() => db?.close())

  it('creates acp_sessions table and stamps user_version', () => {
    db = new AcpSessionDatabase(':memory:')
    const tables = (
      db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(tables).toContain('acp_sessions')
    expect(db.raw.pragma('user_version', { simple: true })).toBe(ACP_SCHEMA_VERSION)
  })

  it('creates the task_id index', () => {
    db = new AcpSessionDatabase(':memory:')
    const idx = (
      db.raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(idx).toContain('idx_acp_sessions_task_id')
  })
})
