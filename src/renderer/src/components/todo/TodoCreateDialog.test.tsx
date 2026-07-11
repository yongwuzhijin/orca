import { describe, expect, it } from 'vitest'
import { buildCreateTodoPayload } from './TodoCreateDialog'

describe('buildCreateTodoPayload', () => {
  it('produces a payload with trimmed title and selected fields', () => {
    const payload = buildCreateTodoPayload({
      projectId: 'p1',
      title: '  Ship it  ',
      description: 'body',
      status: 'todo',
      priority: 'high',
      scheduledDate: '2026-07-11',
      estimate: 3,
      labels: ['ux'],
      templateId: 't1'
    })
    expect(payload).toEqual({
      projectId: 'p1',
      title: 'Ship it',
      description: 'body',
      status: 'todo',
      priority: 'high',
      scheduledDate: '2026-07-11',
      estimate: 3,
      labels: ['ux'],
      templateId: 't1'
    })
  })
  it('omits empty optional fields', () => {
    const payload = buildCreateTodoPayload({ projectId: 'p1', title: 'Bare' })
    expect(payload.projectId).toBe('p1')
    expect(payload.title).toBe('Bare')
    expect(payload.scheduledDate ?? null).toBeNull()
  })
})
