import { describe, expect, it, vi } from 'vitest'
import { resolveTaskTokenCost } from './todo-dashboard-token'
import type { TodoItem } from '../../shared/todo/todo-item'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { AutomationRunUsage } from '../../shared/automations-types'

function item(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'ORCA-1',
    projectId: 'p1',
    title: 'Task one',
    description: '',
    status: 'done',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 'a',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    startedAt: '2026-07-01T00:00:00.000Z',
    completedAt: '2026-07-02T00:00:00.000Z',
    sessionId: null,
    ...overrides
  }
}

function session(overrides: Partial<AcpSessionRecord> = {}): AcpSessionRecord {
  return {
    id: 's1',
    taskId: 't1',
    engine: 'claude',
    sessionId: 'sess-1',
    cwd: '/repo/wt',
    status: 'completed',
    stopReason: null,
    startedAt: '2026-07-01T00:00:00.000Z',
    endedAt: '2026-07-02T00:00:00.000Z',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides
  }
}

function knownUsage(): AutomationRunUsage {
  return {
    status: 'known',
    provider: 'claude',
    model: 'claude-sonnet',
    inputTokens: 10,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 30,
    estimatedCostUsd: 0.12,
    estimatedCostSource: 'api_equivalent',
    providerSessionId: 'sess-1',
    attribution: 'provider_session_time_window',
    collectedAt: 1,
    unavailableReason: null,
    unavailableMessage: null
  }
}

function usageStore(usage: AutomationRunUsage): ClaudeUsageStore {
  return { getAutomationRunUsage: vi.fn(async () => usage) } as unknown as ClaudeUsageStore
}

describe('resolveTaskTokenCost', () => {
  it('returns known cost for a claude session that the store attributes', async () => {
    const result = await resolveTaskTokenCost({
      item: item(),
      session: session(),
      worktreeId: 'w1',
      claudeUsage: usageStore(knownUsage())
    })
    expect(result.status).toBe('known')
    expect(result.provider).toBe('claude')
    expect(result.totalTokens).toBe(30)
    expect(result.estimatedCostUsd).toBe(0.12)
  })

  it('is unavailable with provider null for a non-claude engine', async () => {
    const result = await resolveTaskTokenCost({
      item: item(),
      session: session({ engine: 'qoder' }),
      worktreeId: 'w1',
      claudeUsage: usageStore(knownUsage())
    })
    expect(result.status).toBe('unavailable')
    expect(result.provider).toBeNull()
    expect(result.totalTokens).toBeNull()
  })

  it('is unavailable (provider null) when session is missing', async () => {
    const result = await resolveTaskTokenCost({
      item: item(),
      session: null,
      worktreeId: 'w1',
      claudeUsage: usageStore(knownUsage())
    })
    expect(result.status).toBe('unavailable')
    expect(result.provider).toBeNull()
  })

  it('is unavailable when worktreeId is null', async () => {
    const result = await resolveTaskTokenCost({
      item: item(),
      session: session(),
      worktreeId: null,
      claudeUsage: usageStore(knownUsage())
    })
    expect(result.status).toBe('unavailable')
    expect(result.provider).toBe('claude')
  })

  it('is unavailable when the claude store is null', async () => {
    const result = await resolveTaskTokenCost({
      item: item(),
      session: session(),
      worktreeId: 'w1',
      claudeUsage: null
    })
    expect(result.status).toBe('unavailable')
  })

  it('is unavailable when the store reports usage not known', async () => {
    const notKnown = {
      ...knownUsage(),
      status: 'unavailable' as const,
      totalTokens: null,
      estimatedCostUsd: null
    }
    const result = await resolveTaskTokenCost({
      item: item(),
      session: session(),
      worktreeId: 'w1',
      claudeUsage: usageStore(notKnown)
    })
    expect(result.status).toBe('unavailable')
    expect(result.totalTokens).toBeNull()
  })
})
