import { describe, expect, it } from 'vitest'
import { computeTodoDashboardMetrics } from './todo-dashboard-metrics'
import type { TodoItem } from '../../shared/todo/todo-item'
import type { TokenCostPerTask } from '../../shared/todo/todo-dashboard'

const NOW = Date.parse('2026-07-13T00:00:00.000Z')

function done(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'ORCA-1',
    projectId: 'p1',
    title: 'Task',
    description: '',
    status: 'done',
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
    sessionId: null,
    workspaceProjectId: null,
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    ...overrides
  }
}

function known(taskId: string, totalTokens: number, cost: number): TokenCostPerTask {
  return {
    taskId,
    identifier: taskId,
    title: taskId,
    provider: 'claude',
    status: 'known',
    totalTokens,
    estimatedCostUsd: cost
  }
}

describe('computeTodoDashboardMetrics', () => {
  it('produces an all-empty result for zero done items', () => {
    const m = computeTodoDashboardMetrics({
      doneItems: [],
      tokenByTaskId: new Map(),
      range: '30d',
      now: NOW
    })
    expect(m.doneTaskCount).toBe(0)
    expect(m.throughput).toEqual([])
    expect(m.cycleTime.averageMs).toBeNull()
    expect(m.cycleTime.medianMs).toBeNull()
    expect(m.tokenCost.totalTokens).toBe(0)
    expect(m.estimateAccuracy).toEqual([])
  })

  it('filters out items whose completedAt is outside the range window', () => {
    const inWindow = done({ id: 'in', completedAt: '2026-07-12T00:00:00.000Z' })
    const outWindow = done({ id: 'out', completedAt: '2026-05-01T00:00:00.000Z' })
    const m = computeTodoDashboardMetrics({
      doneItems: [inWindow, outWindow],
      tokenByTaskId: new Map(),
      range: '30d',
      now: NOW
    })
    expect(m.doneTaskCount).toBe(1)
  })

  it('keeps all items when range is all', () => {
    const old = done({ id: 'old', completedAt: '2024-01-01T00:00:00.000Z' })
    const m = computeTodoDashboardMetrics({
      doneItems: [old],
      tokenByTaskId: new Map(),
      range: 'all',
      now: NOW
    })
    expect(m.doneTaskCount).toBe(1)
  })

  it('buckets throughput by day for 30d', () => {
    const a = done({ id: 'a', completedAt: '2026-07-12T05:00:00.000Z' })
    const b = done({ id: 'b', completedAt: '2026-07-12T20:00:00.000Z' })
    const c = done({ id: 'c', completedAt: '2026-07-11T05:00:00.000Z' })
    const m = computeTodoDashboardMetrics({
      doneItems: [a, b, c],
      tokenByTaskId: new Map(),
      range: '30d',
      now: NOW
    })
    expect(m.throughput).toEqual([
      { bucket: '2026-07-11', count: 1 },
      { bucket: '2026-07-12', count: 2 }
    ])
  })

  it('computes average and median cycle time', () => {
    const a = done({
      id: 'a',
      startedAt: '2026-07-11T00:00:00.000Z',
      completedAt: '2026-07-12T00:00:00.000Z'
    })
    const b = done({
      id: 'b',
      startedAt: '2026-07-09T00:00:00.000Z',
      completedAt: '2026-07-12T00:00:00.000Z'
    })
    const m = computeTodoDashboardMetrics({
      doneItems: [a, b],
      tokenByTaskId: new Map(),
      range: '30d',
      now: NOW
    })
    const day = 86400000
    expect(m.cycleTime.averageMs).toBe(2 * day)
    expect(m.cycleTime.medianMs).toBe(2 * day)
    expect(m.cycleTime.samples).toHaveLength(2)
  })

  it('falls back to createdAt when startedAt is missing', () => {
    const a = done({
      id: 'a',
      startedAt: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      completedAt: '2026-07-12T00:00:00.000Z'
    })
    const m = computeTodoDashboardMetrics({
      doneItems: [a],
      tokenByTaskId: new Map(),
      range: '30d',
      now: NOW
    })
    expect(m.cycleTime.samples[0]?.durationMs).toBe(86400000)
  })

  it('sums known token cost and counts unavailable tasks', () => {
    const a = done({ id: 'a' })
    const b = done({ id: 'b' })
    const tokens = new Map<string, TokenCostPerTask>()
    tokens.set('a', known('a', 100, 1.5))
    tokens.set('b', {
      taskId: 'b',
      identifier: 'b',
      title: 'b',
      provider: null,
      status: 'unavailable',
      totalTokens: null,
      estimatedCostUsd: null
    })
    const m = computeTodoDashboardMetrics({
      doneItems: [a, b],
      tokenByTaskId: tokens,
      range: '30d',
      now: NOW
    })
    expect(m.tokenCost.totalTokens).toBe(100)
    expect(m.tokenCost.estimatedCostUsd).toBe(1.5)
    expect(m.tokenCost.knownTaskCount).toBe(1)
    expect(m.tokenCost.unavailableTaskCount).toBe(1)
    expect(m.tokenCost.perTask).toHaveLength(2)
  })

  it('includes only items with estimate and a computable duration in estimateAccuracy', () => {
    const withEstimate = done({ id: 'a', estimate: 3 })
    const noEstimate = done({ id: 'b', estimate: null })
    const m = computeTodoDashboardMetrics({
      doneItems: [withEstimate, noEstimate],
      tokenByTaskId: new Map(),
      range: '30d',
      now: NOW
    })
    expect(m.estimateAccuracy).toHaveLength(1)
    expect(m.estimateAccuracy[0]?.estimatePoints).toBe(3)
    expect(m.estimateAccuracy[0]?.actualMs).toBe(2 * 86400000)
  })

  it('buckets throughput by ISO week for the all range', () => {
    const a = done({ id: 'a', completedAt: '2026-07-08T00:00:00.000Z' })
    const b = done({ id: 'b', completedAt: '2026-07-06T00:00:00.000Z' })
    const m = computeTodoDashboardMetrics({
      doneItems: [a, b],
      tokenByTaskId: new Map(),
      range: 'all',
      now: NOW
    })
    expect(m.throughput).toEqual([{ bucket: '2026-07-06', count: 2 }])
  })
})
