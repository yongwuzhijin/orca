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
  it('includes workspace binding fields when set', () => {
    const payload = buildCreateTodoPayload({
      projectId: 'p1',
      title: 'Ship',
      workspaceProjectId: 'proj-1',
      workspaceName: '  feature-x  ',
      preferredAgent: 'claude'
    })
    expect(payload.workspaceProjectId).toBe('proj-1')
    expect(payload.workspaceName).toBe('feature-x')
    expect(payload.preferredAgent).toBe('claude')
  })

  it('omits empty optional fields', () => {
    const payload = buildCreateTodoPayload({ projectId: 'p1', title: 'Bare' })
    expect(payload.projectId).toBe('p1')
    expect(payload.title).toBe('Bare')
    expect(payload.scheduledDate ?? null).toBeNull()
    expect(payload.workspaceProjectId).toBeUndefined()
    expect(payload.workspaceName).toBeUndefined()
    expect(payload.preferredAgent).toBeUndefined()
  })
})
