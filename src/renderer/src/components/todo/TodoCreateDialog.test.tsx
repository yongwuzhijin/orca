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
      labels: ['ux']
    })
    expect(payload).toEqual({
      projectId: 'p1',
      title: 'Ship it',
      description: 'body',
      status: 'todo',
      priority: 'high',
      scheduledDate: '2026-07-11',
      estimate: 3,
      labels: ['ux']
    })
  })
  it('includes workspace binding fields when set', () => {
    const payload = buildCreateTodoPayload({
      projectId: 'p1',
      title: 'Ship',
      workspaceProjectIds: ['proj-1', 'proj-2'],
      workspaceName: '  feature-x  ',
      prdLink: ' https://doc.example/prd '
    })
    expect(payload.workspaceProjectIds).toEqual(['proj-1', 'proj-2'])
    expect(payload.workspaceProjectId).toBe('proj-1')
    expect(payload.workspaceName).toBe('feature-x')
    expect(payload.prdLink).toBe('https://doc.example/prd')
  })

  it('omits empty optional fields', () => {
    const payload = buildCreateTodoPayload({ projectId: 'p1', title: 'Bare' })
    expect(payload.projectId).toBe('p1')
    expect(payload.title).toBe('Bare')
    expect(payload.scheduledDate ?? null).toBeNull()
    expect(payload.workspaceProjectId).toBeUndefined()
    expect(payload.workspaceName).toBeUndefined()
    expect(payload.prdLink).toBeUndefined()
  })
})
