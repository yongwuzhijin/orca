import { describe, expect, it } from 'vitest'
import type { TodoItem } from '../../shared/todo/todo-item'
import { sortAutoPilotCandidates } from './todo-orchestrator-candidate-order'

function item(over: Partial<TodoItem>): TodoItem {
  return {
    id: 'id',
    identifier: 'T-1',
    projectId: 'p',
    title: 't',
    description: '',
    status: 'todo',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    workspaceProjectId: null,
    workspaceName: null,
    preferredAgent: null,
    orderKey: 'm',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    autoPilotEnabled: true,
    autoPilotMaxTurns: null,
    ...over
  }
}

describe('sortAutoPilotCandidates', () => {
  it('orders by priority desc (urgent first), then orderKey, then createdAt', () => {
    const urgent = item({ id: 'urgent', priority: 'urgent' })
    const low = item({ id: 'low', priority: 'low' })
    const none = item({ id: 'none', priority: 'none' })
    expect(sortAutoPilotCandidates([low, none, urgent]).map((c) => c.id)).toEqual([
      'urgent',
      'low',
      'none'
    ])
  })

  it('breaks priority ties by orderKey ascending', () => {
    const a = item({ id: 'a', priority: 'high', orderKey: 'a' })
    const b = item({ id: 'b', priority: 'high', orderKey: 'b' })
    expect(sortAutoPilotCandidates([b, a]).map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('breaks orderKey ties by createdAt ascending (older first)', () => {
    const older = item({ id: 'older', orderKey: 'm', createdAt: '2026-01-01T00:00:00.000Z' })
    const newer = item({ id: 'newer', orderKey: 'm', createdAt: '2026-02-01T00:00:00.000Z' })
    expect(sortAutoPilotCandidates([newer, older]).map((c) => c.id)).toEqual(['older', 'newer'])
  })
})
