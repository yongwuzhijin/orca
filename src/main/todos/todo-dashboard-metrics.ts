import type { TodoItem } from '../../shared/todo/todo-item'
import type {
  CycleTimeSample,
  EstimateAccuracyPoint,
  ThroughputBucket,
  TodoDashboardMetrics,
  TodoDashboardRange,
  TokenCostPerTask,
  TokenCostSummary
} from '../../shared/todo/todo-dashboard'

const DAY_MS = 86400000

type ComputeInput = {
  doneItems: TodoItem[]
  tokenByTaskId: Map<string, TokenCostPerTask>
  range: TodoDashboardRange
  now: number
}

function rangeStart(range: TodoDashboardRange, now: number): number | null {
  if (range === '7d') {
    return now - 7 * DAY_MS
  }
  if (range === '30d') {
    return now - 30 * DAY_MS
  }
  if (range === '90d') {
    return now - 90 * DAY_MS
  }
  return null
}

function completedMs(item: TodoItem): number | null {
  if (!item.completedAt) {
    return null
  }
  const ms = Date.parse(item.completedAt)
  return Number.isNaN(ms) ? null : ms
}

function dayBucket(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// ISO 周一(UTC)的日期字符串,作为周分桶键。
function weekBucket(ms: number): string {
  const date = new Date(ms)
  const dow = date.getUTCDay() // 0=Sun..6=Sat
  const deltaToMonday = dow === 0 ? 6 : dow - 1
  const monday = ms - deltaToMonday * DAY_MS
  return dayBucket(monday)
}

function computeThroughput(itemsMs: number[], range: TodoDashboardRange): ThroughputBucket[] {
  const byWeek = range === '90d' || range === 'all'
  const counts = new Map<string, number>()
  for (const ms of itemsMs) {
    const key = byWeek ? weekBucket(ms) : dayBucket(ms)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0))
}

function durationMs(item: TodoItem, completed: number): number | null {
  const startSource = item.startedAt ?? item.createdAt
  const start = Date.parse(startSource)
  if (Number.isNaN(start)) {
    return null
  }
  const duration = completed - start
  return duration >= 0 ? duration : null
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function summarizeTokens(
  doneItems: TodoItem[],
  tokenByTaskId: Map<string, TokenCostPerTask>
): TokenCostSummary {
  const perTask: TokenCostPerTask[] = []
  let totalTokens = 0
  let estimatedCostUsd = 0
  let knownTaskCount = 0
  let unavailableTaskCount = 0
  for (const item of doneItems) {
    const entry =
      tokenByTaskId.get(item.id) ??
      ({
        taskId: item.id,
        identifier: item.identifier,
        title: item.title,
        provider: null,
        status: 'unavailable',
        totalTokens: null,
        estimatedCostUsd: null
      } satisfies TokenCostPerTask)
    perTask.push(entry)
    if (entry.status === 'known') {
      knownTaskCount += 1
      totalTokens += entry.totalTokens ?? 0
      estimatedCostUsd += entry.estimatedCostUsd ?? 0
    } else {
      unavailableTaskCount += 1
    }
  }
  return { totalTokens, estimatedCostUsd, knownTaskCount, unavailableTaskCount, perTask }
}

export function computeTodoDashboardMetrics(input: ComputeInput): TodoDashboardMetrics {
  const { doneItems, tokenByTaskId, range, now } = input
  const start = rangeStart(range, now)
  const inRange = doneItems.filter((item) => {
    const ms = completedMs(item)
    if (ms === null) {
      return false
    }
    return start === null || ms >= start
  })

  const completedList: number[] = []
  const samples: CycleTimeSample[] = []
  const durations: number[] = []
  const estimateAccuracy: EstimateAccuracyPoint[] = []
  for (const item of inRange) {
    const completed = completedMs(item)
    if (completed === null) {
      continue
    }
    completedList.push(completed)
    const duration = durationMs(item, completed)
    if (duration !== null) {
      samples.push({
        taskId: item.id,
        identifier: item.identifier,
        title: item.title,
        durationMs: duration
      })
      durations.push(duration)
      if (item.estimate !== null) {
        estimateAccuracy.push({
          taskId: item.id,
          identifier: item.identifier,
          title: item.title,
          estimatePoints: item.estimate,
          actualMs: duration
        })
      }
    }
  }

  const averageMs =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null

  return {
    projectId: '',
    range,
    generatedAt: now,
    doneTaskCount: inRange.length,
    throughput: computeThroughput(completedList, range),
    cycleTime: { averageMs, medianMs: median(durations), samples },
    tokenCost: summarizeTokens(inRange, tokenByTaskId),
    estimateAccuracy
  }
}
