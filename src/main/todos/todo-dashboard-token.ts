import type { TodoItem } from '../../shared/todo/todo-item'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { TokenCostPerTask } from '../../shared/todo/todo-dashboard'

type ResolveInput = {
  item: TodoItem
  session: AcpSessionRecord | null
  worktreeId: string | null
  claudeUsage: ClaudeUsageStore | null
}

function toMs(value: string | null): number | null {
  if (!value) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function unavailable(item: TodoItem, provider: 'claude' | null): TokenCostPerTask {
  return {
    taskId: item.id,
    identifier: item.identifier,
    title: item.title,
    provider,
    status: 'unavailable',
    totalTokens: null,
    estimatedCostUsd: null
  }
}

export async function resolveTaskTokenCost(input: ResolveInput): Promise<TokenCostPerTask> {
  const { item, session, worktreeId, claudeUsage } = input
  // v1 只归因 claude 引擎;其余引擎无 provider 概念。
  if (!session || session.engine !== 'claude') {
    return unavailable(item, null)
  }
  if (!claudeUsage || !worktreeId) {
    return unavailable(item, 'claude')
  }
  const usage = await claudeUsage.getAutomationRunUsage({
    worktreeId,
    terminalSessionId: session.sessionId,
    startedAt: toMs(session.startedAt),
    completedAt: toMs(session.endedAt) ?? Date.now()
  })
  if (usage.status !== 'known') {
    return unavailable(item, 'claude')
  }
  return {
    taskId: item.id,
    identifier: item.identifier,
    title: item.title,
    provider: 'claude',
    status: 'known',
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd
  }
}
