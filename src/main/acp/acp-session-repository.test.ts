import { afterEach, describe, expect, it } from 'vitest'
import { AcpSessionDatabase } from './acp-session-database'
import { AcpSessionRepository } from './acp-session-repository'

describe('AcpSessionRepository', () => {
  let db: AcpSessionDatabase | undefined
  afterEach(() => db?.close())

  function repo(): AcpSessionRepository {
    db = new AcpSessionDatabase(':memory:')
    return new AcpSessionRepository(db)
  }

  it('creates a running record and finds it by sessionId', () => {
    const r = repo()
    const rec = r.create({ taskId: 't1', engine: 'claude', sessionId: 's1', cwd: '/w' })
    expect(rec.status).toBe('running')
    expect(rec.endedAt).toBeNull()
    expect(r.getBySessionId('s1')?.id).toBe(rec.id)
  })

  it('lists sessions for a task newest-first', () => {
    const r = repo()
    r.create({ taskId: 't1', engine: 'claude', sessionId: 's1', cwd: '/w' })
    r.create({ taskId: 't1', engine: 'qoder', sessionId: 's2', cwd: '/w' })
    r.create({ taskId: 't2', engine: 'claude', sessionId: 's3', cwd: '/w' })
    const list = r.listByTask('t1')
    expect(list.map((s) => s.sessionId)).toEqual(['s2', 's1'])
  })

  it('finish stamps status, stopReason and endedAt', () => {
    const r = repo()
    r.create({ taskId: 't1', engine: 'claude', sessionId: 's1', cwd: '/w' })
    const done = r.finish('s1', 'completed', 'end_turn')
    expect(done?.status).toBe('completed')
    expect(done?.stopReason).toBe('end_turn')
    expect(done?.endedAt).not.toBeNull()
  })
})
