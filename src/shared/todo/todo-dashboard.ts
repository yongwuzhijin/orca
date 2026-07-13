export type TodoDashboardRange = '7d' | '30d' | '90d' | 'all'

// 吞吐量:7d/30d 按天分桶;90d/all 按周(ISO 周一)分桶
export type ThroughputBucket = { bucket: string; count: number }

// 周期时间:started→completed 时长;缺 startedAt 用 createdAt 兜底
export type CycleTimeSample = {
  taskId: string
  identifier: string
  title: string
  durationMs: number
}
export type CycleTimeStats = {
  averageMs: number | null
  medianMs: number | null
  samples: CycleTimeSample[]
}

// Token 成本:逐任务 + 汇总;归因不到 → unavailable(优雅降级)
export type TokenCostPerTask = {
  taskId: string
  identifier: string
  title: string
  provider: 'claude' | 'codex' | null
  status: 'known' | 'unavailable'
  totalTokens: number | null
  estimatedCostUsd: number | null
}
export type TokenCostSummary = {
  totalTokens: number
  estimatedCostUsd: number
  knownTaskCount: number
  unavailableTaskCount: number
  perTask: TokenCostPerTask[]
}

// 预估 vs 实际:仅含 estimate 与周期都存在的任务
export type EstimateAccuracyPoint = {
  taskId: string
  identifier: string
  title: string
  estimatePoints: number
  actualMs: number
}

export type TodoDashboardMetrics = {
  projectId: string
  range: TodoDashboardRange
  generatedAt: number
  doneTaskCount: number
  throughput: ThroughputBucket[]
  cycleTime: CycleTimeStats
  tokenCost: TokenCostSummary
  estimateAccuracy: EstimateAccuracyPoint[]
}
