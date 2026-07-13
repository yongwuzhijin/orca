import { describe, expect, it, vi } from 'vitest'
import { createTodoDashboardService } from './todo-dashboard-service'
import type { TodoItem } from '../../shared/todo/todo-item'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type { TokenCostPerTask } from '../../shared/todo/todo-dashboard'

const NOW = Date.parse('2026-07-13T00:00:00.000Z')

function item(id: string, status: TodoItem['status']): TodoItem {
  return {
    id,
    identifier: id,
    projectId: 'p1',
    title: id,
    description: '',
    status,
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 'a',
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    startedAt: '2026-07-10T00:00:00.000Z',
    completedAt: '2026-07-12T00:00:00.000Z',
    sessionId: null
  }
}

function session(taskId: string): AcpSessionRecord {
  return {
    id: `s-${taskId}`,
    taskId,
    engine: 'claude',
    sessionId: `sess-${taskId}`,
    cwd: '/repo/wt',
    status: 'completed',
    stopReason: null,
    startedAt: '2026-07-10T00:00:00.000Z',
    endedAt: '2026-07-12T00:00:00.000Z',
    createdAt: '2026-07-10T00:00:00.000Z'
  }
}

function unavailable(taskId: string): TokenCostPerTask {
  return {
    taskId,
    identifier: taskId,
    title: taskId,
    provider: null,
    status: 'unavailable',
    totalTokens: null,
    estimatedCostUsd: null
  }
}

describe('createTodoDashboardService', () => {
  it('filters to done items, wires token attribution, and stamps projectId', async () => {
    const listItems = vi.fn(() => [item('a', 'done'), item('b', 'in_progress'), item('c', 'done')])
    const getSessions = vi.fn((taskId: string) => [session(taskId)])
    const resolveWorktreeId = vi.fn(() => 'w1')
    const resolveTokenCost = vi.fn(async (input: { item: TodoItem }) => unavailable(input.item.id))

    const service = createTodoDashboardService({
      listItems,
      getSessions,
      resolveWorktreeId,
      resolveTokenCost,
      now: () => NOW
    })
    const metrics = await service.getMetrics({ projectId: 'p1', range: 'all' })

    expect(metrics.projectId).toBe('p1')
    expect(metrics.doneTaskCount).toBe(2)
    expect(listItems).toHaveBeenCalledWith('p1')
    expect(resolveTokenCost).toHaveBeenCalledTimes(2)
    expect(resolveWorktreeId).toHaveBeenCalledWith('/repo/wt')
    expect(metrics.tokenCost.unavailableTaskCount).toBe(2)
  })

  it('passes null session/worktreeId when a task has no sessions', async () => {
    const resolveTokenCost = vi.fn(async (input: { item: TodoItem }) => unavailable(input.item.id))
    const resolveWorktreeId = vi.fn(() => null)
    const service = createTodoDashboardService({
      listItems: () => [item('a', 'done')],
      getSessions: () => [],
      resolveWorktreeId,
      resolveTokenCost,
      now: () => NOW
    })
    await service.getMetrics({ projectId: 'p1', range: '30d' })
    expect(resolveWorktreeId).toHaveBeenCalledWith(null)
    expect(resolveTokenCost).toHaveBeenCalledWith(
      expect.objectContaining({ session: null, worktreeId: null })
    )
  })
})
