# TODO Board P4b:Done 数据看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 TODO 页内提供一个只读的 Done 数据看板,对当前项目已完成任务量化呈现吞吐量、周期时间、Token 成本、预估 vs 实际四个指标。

**Architecture:** 延续 P4a 的「纯函数 + 注入式 IO」分层。主进程三个可单测模块(纯计算 `computeTodoDashboardMetrics`、注入式 token 归因 `resolveTaskTokenCost`、纯 worktree 解析 `resolveWorktreeIdByPath`)+ 编排 service,经单个只读瘦 IPC `todos:dashboard.getMetrics` + preload 绑定暴露给渲染层。渲染层新增 `dashboard/` 目录(容器 + 4 张卡/图 + 格式化纯函数),TodoPage 加 viewMode Tabs 切换看板/数据。

**Tech Stack:** TypeScript、Electron IPC、React + Zustand、recharts(新增)、vitest(node + happy-dom)、shadcn ui 原语(Tabs/ToggleGroup)、`--chart-1..5` 设计 token。

**关键约束(每个任务都要遵守):**
- 所有 `if` 带大括号(oxlint `curly`)。
- 渲染层滚动容器(`overflow-auto`/`overflow-y-auto`)必须同 class 字面量含 `scrollbar-sleek`。
- 不加 `max-lines` 豁免;文件按职责拆分。
- 不造新色/新字号;recharts 系列色用 `var(--chart-1..5)`,文字/网格用 `--muted-foreground` 等语义 token。
- DOM 测试:文件首行 `// @vitest-environment happy-dom`,`import '@testing-library/jest-dom/vitest'`,`afterEach(cleanup)`;只 mock `window.api`,不替换整个 `window`。
- i18n 文案走 `translate('auto.components.todo.dashboard.<Comp>.<key>', 'English')`,最后跑 `pnpm run sync:localization-catalog`。
- **token 归因 v1 只支持 claude 引擎**(`AcpEngine = ['claude','qoder','cursor']`,无 codex),`TokenCostPerTask.provider` 仍保留 `'claude'|'codex'|null` 联合以兼容 DTO,但实现只产出 claude / null。
- 从不主动 `git commit`,除非用户明确要求(项目约定覆盖 skill 的 commit 步骤)——各任务末尾的 commit 步骤仅在用户已授权批量提交时执行,否则跳过并保留改动。

---

## File Structure

**新增(shared):**
- `src/shared/todo/todo-dashboard.ts` — DTO 类型(零逻辑)。

**新增(main,纯函数/注入式,全部可单测):**
- `src/main/todos/todo-dashboard-worktree.ts` + `.test.ts` — cwd → worktreeId 纯解析(最长归一化前缀匹配)。
- `src/main/todos/todo-dashboard-token.ts` + `.test.ts` — 注入式 claude token 归因,收敛成 `TokenCostPerTask`。
- `src/main/todos/todo-dashboard-metrics.ts` + `.test.ts` — 纯计算聚合(range 过滤/分桶/统计/散点)。
- `src/main/todos/todo-dashboard-service.ts` + `.test.ts` — 依赖注入编排。

**新增(main,IPC):**
- `src/main/ipc/todo-dashboard.ts` — 注册 `todos:dashboard.getMetrics`。

**新增(renderer):**
- `src/renderer/src/components/todo/dashboard/format-dashboard-values.ts` + `.test.ts` — `formatDuration/formatTokens/formatUsd` 纯函数。
- `src/renderer/src/components/todo/dashboard/TodoDashboard.tsx` + `.test.tsx` — 容器 + 状态机。
- `src/renderer/src/components/todo/dashboard/ThroughputChart.tsx` — recharts BarChart。
- `src/renderer/src/components/todo/dashboard/CycleTimeCard.tsx` — 平均/中位 + 样本列表。
- `src/renderer/src/components/todo/dashboard/TokenCostCard.tsx` — 汇总 + perTask 列表。
- `src/renderer/src/components/todo/dashboard/EstimateAccuracyChart.tsx` — recharts ScatterChart。

**修改:**
- `src/main/ipc/register-core-handlers.ts` — 接线注册 handler。
- `src/preload/index.ts` + `src/preload/api-types.ts` — 绑定 + 类型。
- `src/renderer/src/components/todo/TodoPage.tsx` — viewMode + Tabs。
- `package.json` — 新增 recharts 依赖。

---

## Task 1: Shared DTO 类型

**Files:**
- Create: `src/shared/todo/todo-dashboard.ts`

- [ ] **Step 1: 写类型文件**

```ts
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
```

- [ ] **Step 2: typecheck 验证**

Run: `pnpm typecheck`
Expected: PASS(纯类型文件,无引用即通过)

- [ ] **Step 3: Commit(仅在用户授权批量提交时)**

```bash
git add src/shared/todo/todo-dashboard.ts
git commit -m "feat(todo-p4b): add Done dashboard DTO types"
```

---

## Task 2: `resolveWorktreeIdByPath` 纯函数 + 测试

将任务 session 的 `cwd` 解析成 `worktreeId`(供 token 归因用)。scanner 内部的路径助手(`findContainingWorktree`/`canonicalizePath`)是私有的,不能复用 → 新写一个纯函数,做最长归一化前缀匹配。

**Files:**
- Create: `src/main/todos/todo-dashboard-worktree.ts`
- Test: `src/main/todos/todo-dashboard-worktree.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { resolveWorktreeIdByPath } from './todo-dashboard-worktree'
import type { UsageWorktreeRef } from '../usage-worktree-metadata'

function refs(list: Array<[string, string]>): Map<string, UsageWorktreeRef[]> {
  const map = new Map<string, UsageWorktreeRef[]>()
  map.set('repo', list.map(([worktreeId, path]) => ({ worktreeId, path, displayName: path })))
  return map
}

describe('resolveWorktreeIdByPath', () => {
  it('returns null for empty cwd', () => {
    expect(resolveWorktreeIdByPath(null, refs([['w1', '/repo']]))).toBeNull()
    expect(resolveWorktreeIdByPath(undefined, refs([['w1', '/repo']]))).toBeNull()
    expect(resolveWorktreeIdByPath('', refs([['w1', '/repo']]))).toBeNull()
  })

  it('matches exact path', () => {
    expect(resolveWorktreeIdByPath('/repo/wt', refs([['w1', '/repo/wt']]))).toBe('w1')
  })

  it('matches a nested cwd under a worktree path', () => {
    expect(resolveWorktreeIdByPath('/repo/wt/src/main', refs([['w1', '/repo/wt']]))).toBe('w1')
  })

  it('prefers the longest matching prefix', () => {
    const map = refs([
      ['root', '/repo'],
      ['nested', '/repo/wt']
    ])
    expect(resolveWorktreeIdByPath('/repo/wt/src', map)).toBe('nested')
  })

  it('does not match a sibling that only shares a string prefix', () => {
    expect(resolveWorktreeIdByPath('/repo/wt-other/src', refs([['w1', '/repo/wt']]))).toBeNull()
  })

  it('returns null when nothing contains the cwd', () => {
    expect(resolveWorktreeIdByPath('/elsewhere', refs([['w1', '/repo/wt']]))).toBeNull()
  })

  it('normalizes trailing slashes and backslashes', () => {
    expect(resolveWorktreeIdByPath('/repo/wt/', refs([['w1', '/repo/wt']]))).toBe('w1')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-worktree.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```ts
import type { UsageWorktreeRef } from '../usage-worktree-metadata'

function normalizePath(p: string): string {
  const unified = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? unified.toLowerCase() : unified
}

export function resolveWorktreeIdByPath(
  cwd: string | null | undefined,
  worktreesByRepo: Map<string, UsageWorktreeRef[]>
): string | null {
  if (!cwd) {
    return null
  }
  const target = normalizePath(cwd)
  let best: { worktreeId: string; len: number } | null = null
  for (const list of worktreesByRepo.values()) {
    for (const ref of list) {
      const base = normalizePath(ref.path)
      if (target === base || target.startsWith(`${base}/`)) {
        if (!best || base.length > best.len) {
          best = { worktreeId: ref.worktreeId, len: base.length }
        }
      }
    }
  }
  return best ? best.worktreeId : null
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-worktree.test.ts`
Expected: PASS(7 测试)

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/main/todos/todo-dashboard-worktree.ts src/main/todos/todo-dashboard-worktree.test.ts
git commit -m "feat(todo-p4b): add cwd->worktreeId resolver"
```

---

## Task 3: `resolveTaskTokenCost` 注入式 token 归因 + 测试

engine→provider 映射 + 调 claude usage store,收敛成 `TokenCostPerTask`。**只支持 claude 引擎**;非 claude / 缺 session / 缺 worktreeId / store 为 null / usage 非 known → `unavailable`。

**Files:**
- Create: `src/main/todos/todo-dashboard-token.ts`
- Test: `src/main/todos/todo-dashboard-token.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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

  it('is unavailable (provider claude) when session is missing', async () => {
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
    const notKnown = { ...knownUsage(), status: 'unavailable' as const, totalTokens: null, estimatedCostUsd: null }
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-token.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-token.test.ts`
Expected: PASS(6 测试)

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/main/todos/todo-dashboard-token.ts src/main/todos/todo-dashboard-token.test.ts
git commit -m "feat(todo-p4b): add claude token attribution for done tasks"
```

---

## Task 4: `computeTodoDashboardMetrics` 纯计算 + 测试

range 窗口过滤(按 completedAt)、吞吐量天/周分桶、周期 average/median、token 汇总、预估散点组装。零 IO。

**Files:**
- Create: `src/main/todos/todo-dashboard-metrics.ts`
- Test: `src/main/todos/todo-dashboard-metrics.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
    const m = computeTodoDashboardMetrics({ doneItems: [], tokenByTaskId: new Map(), range: '30d', now: NOW })
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
    const m = computeTodoDashboardMetrics({ doneItems: [old], tokenByTaskId: new Map(), range: 'all', now: NOW })
    expect(m.doneTaskCount).toBe(1)
  })

  it('buckets throughput by day for 30d', () => {
    const a = done({ id: 'a', completedAt: '2026-07-12T05:00:00.000Z' })
    const b = done({ id: 'b', completedAt: '2026-07-12T20:00:00.000Z' })
    const c = done({ id: 'c', completedAt: '2026-07-11T05:00:00.000Z' })
    const m = computeTodoDashboardMetrics({ doneItems: [a, b, c], tokenByTaskId: new Map(), range: '30d', now: NOW })
    expect(m.throughput).toEqual([
      { bucket: '2026-07-11', count: 1 },
      { bucket: '2026-07-12', count: 2 }
    ])
  })

  it('computes average and median cycle time', () => {
    // durations: 1 day, 3 days -> avg 2 days, median 2 days
    const a = done({ id: 'a', startedAt: '2026-07-11T00:00:00.000Z', completedAt: '2026-07-12T00:00:00.000Z' })
    const b = done({ id: 'b', startedAt: '2026-07-09T00:00:00.000Z', completedAt: '2026-07-12T00:00:00.000Z' })
    const m = computeTodoDashboardMetrics({ doneItems: [a, b], tokenByTaskId: new Map(), range: '30d', now: NOW })
    const day = 86400000
    expect(m.cycleTime.averageMs).toBe(2 * day)
    expect(m.cycleTime.medianMs).toBe(2 * day)
    expect(m.cycleTime.samples).toHaveLength(2)
  })

  it('falls back to createdAt when startedAt is missing', () => {
    const a = done({ id: 'a', startedAt: null, createdAt: '2026-07-11T00:00:00.000Z', completedAt: '2026-07-12T00:00:00.000Z' })
    const m = computeTodoDashboardMetrics({ doneItems: [a], tokenByTaskId: new Map(), range: '30d', now: NOW })
    expect(m.cycleTime.samples[0]?.durationMs).toBe(86400000)
  })

  it('sums known token cost and counts unavailable tasks', () => {
    const a = done({ id: 'a' })
    const b = done({ id: 'b' })
    const tokens = new Map<string, TokenCostPerTask>()
    tokens.set('a', known('a', 100, 1.5))
    tokens.set('b', { taskId: 'b', identifier: 'b', title: 'b', provider: null, status: 'unavailable', totalTokens: null, estimatedCostUsd: null })
    const m = computeTodoDashboardMetrics({ doneItems: [a, b], tokenByTaskId: tokens, range: '30d', now: NOW })
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
    const a = done({ id: 'a', completedAt: '2026-07-08T00:00:00.000Z' }) // Wed
    const b = done({ id: 'b', completedAt: '2026-07-06T00:00:00.000Z' }) // Mon same week
    const m = computeTodoDashboardMetrics({ doneItems: [a, b], tokenByTaskId: new Map(), range: 'all', now: NOW })
    expect(m.throughput).toEqual([{ bucket: '2026-07-06', count: 2 }])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-metrics.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```ts
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
      samples.push({ taskId: item.id, identifier: item.identifier, title: item.title, durationMs: duration })
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
    durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null

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
```

> 注:`projectId` 在纯函数里先留空串,由 service 层填入真实 projectId(见 Task 5)。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-metrics.test.ts`
Expected: PASS(9 测试)

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/main/todos/todo-dashboard-metrics.ts src/main/todos/todo-dashboard-metrics.test.ts
git commit -m "feat(todo-p4b): add pure dashboard metrics computation"
```

---

## Task 5: `createTodoDashboardService` 编排 + 测试

依赖注入:listItems / getSessions / resolveWorktreeId / resolveTokenCost / now。过滤 done → 逐任务取 session + worktreeId + token → 组装 metrics,并填入真实 projectId。

**Files:**
- Create: `src/main/todos/todo-dashboard-service.ts`
- Test: `src/main/todos/todo-dashboard-service.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
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
  return { taskId, identifier: taskId, title: taskId, provider: null, status: 'unavailable', totalTokens: null, estimatedCostUsd: null }
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
    expect(resolveTokenCost).toHaveBeenCalledWith(expect.objectContaining({ session: null, worktreeId: null }))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-service.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```ts
import type { TodoItem } from '../../shared/todo/todo-item'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type { TodoDashboardMetrics, TodoDashboardRange, TokenCostPerTask } from '../../shared/todo/todo-dashboard'
import { computeTodoDashboardMetrics } from './todo-dashboard-metrics'

export type TodoDashboardServiceDeps = {
  listItems: (projectId: string) => TodoItem[]
  getSessions: (taskId: string) => AcpSessionRecord[]
  resolveWorktreeId: (cwd: string | null) => string | null
  resolveTokenCost: (input: {
    item: TodoItem
    session: AcpSessionRecord | null
    worktreeId: string | null
  }) => Promise<TokenCostPerTask>
  now: () => number
}

export function createTodoDashboardService(deps: TodoDashboardServiceDeps) {
  return {
    async getMetrics(args: { projectId: string; range: TodoDashboardRange }): Promise<TodoDashboardMetrics> {
      const doneItems = deps.listItems(args.projectId).filter((item) => item.status === 'done')
      const tokenByTaskId = new Map<string, TokenCostPerTask>()
      for (const item of doneItems) {
        const session = deps.getSessions(item.id)[0] ?? null
        const worktreeId = deps.resolveWorktreeId(session?.cwd ?? null)
        const cost = await deps.resolveTokenCost({ item, session, worktreeId })
        tokenByTaskId.set(item.id, cost)
      }
      const metrics = computeTodoDashboardMetrics({
        doneItems,
        tokenByTaskId,
        range: args.range,
        now: deps.now()
      })
      return { ...metrics, projectId: args.projectId }
    }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-service.test.ts`
Expected: PASS(2 测试)

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/main/todos/todo-dashboard-service.ts src/main/todos/todo-dashboard-service.test.ts
git commit -m "feat(todo-p4b): add dashboard service orchestration"
```

---

## Task 6: 瘦 IPC + register-core-handlers 接线

**Files:**
- Create: `src/main/ipc/todo-dashboard.ts`
- Modify: `src/main/ipc/register-core-handlers.ts`

- [ ] **Step 1: 写 IPC handler 文件**

```ts
import { ipcMain } from 'electron'
import type { TodoDashboardRange } from '../../shared/todo/todo-dashboard'
import { createTodoDashboardService, type TodoDashboardServiceDeps } from '../todos/todo-dashboard-service'

export function registerTodoDashboardHandlers(deps: TodoDashboardServiceDeps): void {
  const service = createTodoDashboardService(deps)
  ipcMain.handle(
    'todos:dashboard.getMetrics',
    (_event, args: { projectId: string; range: TodoDashboardRange }) => service.getMetrics(args)
  )
}
```

- [ ] **Step 2: 在 register-core-handlers.ts 顶部加导入**

在现有 `import { registerTodoMergeHandlers } from './todo-merge'`(第 63 行)后追加:

```ts
import { registerTodoDashboardHandlers } from './todo-dashboard'
```

在 `import { scanReviewPortsForTask } from '../acp/review-port-scan'`(第 65 行)附近追加:

```ts
import { resolveTaskTokenCost } from '../todos/todo-dashboard-token'
import { resolveWorktreeIdByPath } from '../todos/todo-dashboard-worktree'
import { loadKnownUsageWorktreesByRepo } from '../usage-worktree-metadata'
```

- [ ] **Step 3: 在 registerTodoMergeHandlers 调用之后接线**

在 `register-core-handlers.ts` 的 `registerTodoMergeHandlers({...})` 块(约结束于第 226 行,`})` 之后、函数体结尾 `}` 之前)插入:

```ts
  registerTodoDashboardHandlers({
    listItems: (projectId) => runtime.getTodoRepository().listItems(projectId),
    getSessions: (taskId) => acpKernel.sessionManager.listSessions(taskId) as AcpSessionRecord[],
    resolveWorktreeId: (cwd) =>
      resolveWorktreeIdByPath(cwd, loadKnownUsageWorktreesByRepo(store, store.getRepos())),
    resolveTokenCost: (input) => resolveTaskTokenCost({ ...input, claudeUsage }),
    now: () => Date.now()
  })
```

> 说明:`store`、`claudeUsage` 是 `registerCoreHandlers` 的现成入参;`runtime.getTodoRepository()`、`acpKernel.sessionManager.listSessions(...)` 与 P3/P4a 同款用法;`AcpSessionRecord` 类型已在文件顶部导入。

- [ ] **Step 4: typecheck 验证**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/main/ipc/todo-dashboard.ts src/main/ipc/register-core-handlers.ts
git commit -m "feat(todo-p4b): wire dashboard IPC handler"
```

---

## Task 7: preload 绑定 + 类型

**Files:**
- Modify: `src/preload/index.ts`(todos 块,merge 绑定同级,约第 4240-4244 行)
- Modify: `src/preload/api-types.ts`(todos 类型块,merge 类型同级,约第 3110-3112 行)

- [ ] **Step 1: 在 preload/index.ts 的 todos.merge 绑定旁加 dashboard**

在 todos 对象内、`merge: { preview: ..., execute: ... }` 之后追加(补上逗号):

```ts
      dashboard: {
        getMetrics: (args: { projectId: string; range: import('../shared/todo/todo-dashboard').TodoDashboardRange }) =>
          ipcRenderer.invoke('todos:dashboard.getMetrics', args)
      }
```

> 若 preload 文件顶部已集中管理类型导入,可改为顶部 `import type { TodoDashboardRange } from '../shared/todo/todo-dashboard'` 并在此处用 `TodoDashboardRange`;跟随该文件既有风格即可。

- [ ] **Step 2: 在 api-types.ts 的 todos.merge 类型旁加 dashboard**

先在文件顶部类型导入区加:

```ts
import type { TodoDashboardMetrics, TodoDashboardRange } from '../shared/todo/todo-dashboard'
```

在 todos 类型块内、`merge: { preview: ...; execute: ... }` 之后追加:

```ts
    dashboard: {
      getMetrics: (args: { projectId: string; range: TodoDashboardRange }) => Promise<TodoDashboardMetrics>
    }
```

- [ ] **Step 3: typecheck 验证**

Run: `pnpm typecheck`
Expected: PASS(preload 与 api-types 结构对齐)

- [ ] **Step 4: Commit(仅在用户授权批量提交时)**

```bash
git add src/preload/index.ts src/preload/api-types.ts
git commit -m "feat(todo-p4b): expose dashboard.getMetrics over preload"
```

---

## Task 8: `format-dashboard-values` 渲染层纯函数 + 测试

**Files:**
- Create: `src/renderer/src/components/todo/dashboard/format-dashboard-values.ts`
- Test: `src/renderer/src/components/todo/dashboard/format-dashboard-values.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { formatDuration, formatTokens, formatUsd } from './format-dashboard-values'

describe('formatDuration', () => {
  it('formats sub-minute as seconds', () => {
    expect(formatDuration(5000)).toBe('5s')
  })
  it('formats minutes', () => {
    expect(formatDuration(120000)).toBe('2m')
  })
  it('formats hours', () => {
    expect(formatDuration(3 * 3600000)).toBe('3h')
  })
  it('formats days', () => {
    expect(formatDuration(2 * 86400000)).toBe('2d')
  })
  it('formats null as a dash', () => {
    expect(formatDuration(null)).toBe('—')
  })
})

describe('formatTokens', () => {
  it('formats small numbers as-is', () => {
    expect(formatTokens(500)).toBe('500')
  })
  it('formats thousands with K', () => {
    expect(formatTokens(12000)).toBe('12.0K')
  })
  it('formats millions with M', () => {
    expect(formatTokens(3_400_000)).toBe('3.4M')
  })
})

describe('formatUsd', () => {
  it('formats with a dollar sign and two decimals', () => {
    expect(formatUsd(1.5)).toBe('$1.50')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/dashboard/format-dashboard-values.test.ts`
Expected: FAIL

- [ ] **Step 3: 写实现**

```ts
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  if (ms < MINUTE) {
    return `${Math.round(ms / SECOND)}s`
  }
  if (ms < HOUR) {
    return `${Math.round(ms / MINUTE)}m`
  }
  if (ms < DAY) {
    return `${Math.round(ms / HOUR)}h`
  }
  return `${Math.round(ms / DAY)}d`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`
  }
  return `${n}`
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/dashboard/format-dashboard-values.test.ts`
Expected: PASS(9 测试)

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/renderer/src/components/todo/dashboard/format-dashboard-values.ts src/renderer/src/components/todo/dashboard/format-dashboard-values.test.ts
git commit -m "feat(todo-p4b): add dashboard value formatters"
```

---

## Task 9: 新增 recharts 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 recharts**

Run: `pnpm add recharts`
Expected: `package.json` `dependencies` 新增 `recharts`,lockfile 更新。

- [ ] **Step 2: 确认可解析**

Run: `node -e "require.resolve('recharts'); console.log('ok')"`
Expected: 输出 `ok`

- [ ] **Step 3: Commit(仅在用户授权批量提交时)**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(todo-p4b): add recharts dependency"
```

---

## Task 10: 图表与卡片子组件(4 个)+ 冒烟测试

每个子组件单一职责,控 max-lines。recharts 图表用 `ResponsiveContainer`;颜色用 `var(--chart-1..5)`。冒烟测试各自 mock `ResizeObserver` 后断言「传数据不崩」。

**Files:**
- Create: `ThroughputChart.tsx` / `CycleTimeCard.tsx` / `TokenCostCard.tsx` / `EstimateAccuracyChart.tsx`
- Test: `ThroughputChart.test.tsx`(其余卡片按需最小冒烟;CycleTime/TokenCost 为纯 DOM,可各写一条渲染断言)

- [ ] **Step 1: 写 ThroughputChart.tsx**

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ThroughputBucket } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '../../../i18n/translate'

export function ThroughputChart({ data }: { data: ThroughputBucket[] }): JSX.Element {
  return (
    <div className="flex h-56 flex-col gap-2">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.ThroughputChart.title', 'Throughput')}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="bucket" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

> `translate` 导入路径与相对层级以该目录既有组件为准(可先 grep `from '.*i18n/translate'` 在 `src/renderer/src/components/todo/` 下确认实际路径,统一采用)。

- [ ] **Step 2: 写 EstimateAccuracyChart.tsx**

```tsx
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { EstimateAccuracyPoint } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '../../../i18n/translate'

export function EstimateAccuracyChart({ data }: { data: EstimateAccuracyPoint[] }): JSX.Element {
  const points = data.map((point) => ({
    x: point.estimatePoints,
    y: point.actualMs / 3600000,
    title: point.title
  }))
  return (
    <div className="flex h-56 flex-col gap-2">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.EstimateAccuracyChart.title', 'Estimate vs actual')}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name={translate('auto.components.todo.dashboard.EstimateAccuracyChart.xAxis', 'Estimate (points)')}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={translate('auto.components.todo.dashboard.EstimateAccuracyChart.yAxis', 'Actual (hours)')}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={points} fill="var(--chart-2)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: 写 CycleTimeCard.tsx**

```tsx
import type { CycleTimeStats } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '../../../i18n/translate'
import { formatDuration } from './format-dashboard-values'

export function CycleTimeCard({ stats }: { stats: CycleTimeStats }): JSX.Element {
  return (
    <div className="flex h-56 flex-col gap-3">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.CycleTimeCard.title', 'Cycle time')}
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.CycleTimeCard.average', 'Average')}
          </span>
          <span className="text-lg font-semibold text-foreground">{formatDuration(stats.averageMs)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.CycleTimeCard.median', 'Median')}
          </span>
          <span className="text-lg font-semibold text-foreground">{formatDuration(stats.medianMs)}</span>
        </div>
      </div>
      <div className="scrollbar-sleek flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {stats.samples.map((sample) => (
            <li key={sample.taskId} className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate">
                {sample.identifier} · {sample.title}
              </span>
              <span className="shrink-0 pl-2">{formatDuration(sample.durationMs)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 写 TokenCostCard.tsx**

```tsx
import type { TokenCostSummary } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '../../../i18n/translate'
import { formatTokens, formatUsd } from './format-dashboard-values'

export function TokenCostCard({ summary }: { summary: TokenCostSummary }): JSX.Element {
  return (
    <div className="flex h-56 flex-col gap-3">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.TokenCostCard.title', 'Token cost')}
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.TokenCostCard.tokens', 'Tokens')}
          </span>
          <span className="text-lg font-semibold text-foreground">{formatTokens(summary.totalTokens)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.TokenCostCard.cost', 'Est. cost')}
          </span>
          <span className="text-lg font-semibold text-foreground">{formatUsd(summary.estimatedCostUsd)}</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {translate('auto.components.todo.dashboard.TokenCostCard.coverage', 'Attributed')}: {summary.knownTaskCount} /{' '}
        {summary.knownTaskCount + summary.unavailableTaskCount}
      </div>
      <div className="scrollbar-sleek flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {summary.perTask.map((task) => (
            <li
              key={task.taskId}
              className={`flex justify-between text-xs ${
                task.status === 'known' ? 'text-muted-foreground' : 'text-muted-foreground/50'
              }`}
            >
              <span className="truncate">
                {task.identifier} · {task.title}
              </span>
              <span className="shrink-0 pl-2">
                {task.status === 'known' && task.totalTokens !== null
                  ? formatTokens(task.totalTokens)
                  : translate('auto.components.todo.dashboard.TokenCostCard.unavailable', 'n/a')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 写 ThroughputChart.test.tsx(冒烟)**

```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi, beforeAll } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ThroughputChart } from './ThroughputChart'

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
})

afterEach(() => {
  cleanup()
})

describe('ThroughputChart', () => {
  it('renders without crashing when given data', () => {
    const { container } = render(<ThroughputChart data={[{ bucket: '2026-07-12', count: 3 }]} />)
    expect(container).toBeTruthy()
  })

  it('renders without crashing when data is empty', () => {
    const { container } = render(<ThroughputChart data={[]} />)
    expect(container).toBeTruthy()
  })
})
```

- [ ] **Step 6: 运行图表冒烟 + typecheck**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/dashboard/ThroughputChart.test.tsx`
Expected: PASS
Run: `pnpm typecheck`
Expected: PASS

> 若 `../../../i18n/translate` 路径与实际不符,typecheck 会报错——按 grep 出的真实路径修正所有子组件的 translate 导入。

- [ ] **Step 7: Commit(仅在用户授权批量提交时)**

```bash
git add src/renderer/src/components/todo/dashboard/ThroughputChart.tsx src/renderer/src/components/todo/dashboard/EstimateAccuracyChart.tsx src/renderer/src/components/todo/dashboard/CycleTimeCard.tsx src/renderer/src/components/todo/dashboard/TokenCostCard.tsx src/renderer/src/components/todo/dashboard/ThroughputChart.test.tsx
git commit -m "feat(todo-p4b): add dashboard chart and card components"
```

---

## Task 11: `TodoDashboard` 容器 + 测试

props `{ projectId }`,本地 `range` 默认 `'30d'`,useEffect 调 `window.api.todos.dashboard.getMetrics`,loading/error/ready 状态机;ToggleGroup 7/30/90/全部;grid 排 4 卡;`doneTaskCount===0` 空态;error 态带重试按钮。容器测试用 `vi.mock` 掉 4 个图表/卡片子组件,只测容器逻辑。

**Files:**
- Create: `src/renderer/src/components/todo/dashboard/TodoDashboard.tsx`
- Test: `src/renderer/src/components/todo/dashboard/TodoDashboard.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TodoDashboard } from './TodoDashboard'
import type { TodoDashboardMetrics } from '../../../../../shared/todo/todo-dashboard'

vi.mock('./ThroughputChart', () => ({ ThroughputChart: () => <div data-testid="throughput" /> }))
vi.mock('./EstimateAccuracyChart', () => ({ EstimateAccuracyChart: () => <div data-testid="estimate" /> }))
vi.mock('./CycleTimeCard', () => ({ CycleTimeCard: () => <div data-testid="cycle" /> }))
vi.mock('./TokenCostCard', () => ({ TokenCostCard: () => <div data-testid="token" /> }))

function metrics(overrides: Partial<TodoDashboardMetrics> = {}): TodoDashboardMetrics {
  return {
    projectId: 'p1',
    range: '30d',
    generatedAt: 1,
    doneTaskCount: 2,
    throughput: [],
    cycleTime: { averageMs: null, medianMs: null, samples: [] },
    tokenCost: { totalTokens: 0, estimatedCostUsd: 0, knownTaskCount: 0, unavailableTaskCount: 0, perTask: [] },
    estimateAccuracy: [],
    ...overrides
  }
}

function setApi(getMetrics: ReturnType<typeof vi.fn>): void {
  ;(window as unknown as { api: unknown }).api = { todos: { dashboard: { getMetrics } } }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TodoDashboard', () => {
  it('renders charts once metrics load', async () => {
    const getMetrics = vi.fn(async () => metrics())
    setApi(getMetrics)
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('throughput')).toBeInTheDocument())
    expect(getMetrics).toHaveBeenCalledWith({ projectId: 'p1', range: '30d' })
  })

  it('shows empty state when there are no done tasks', async () => {
    setApi(vi.fn(async () => metrics({ doneTaskCount: 0 })))
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(screen.queryByTestId('throughput')).not.toBeInTheDocument())
    expect(screen.getByText(/no completed tasks/i)).toBeInTheDocument()
  })

  it('refetches when the range changes', async () => {
    const getMetrics = vi.fn(async () => metrics())
    setApi(getMetrics)
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('7d'))
    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith({ projectId: 'p1', range: '7d' }))
  })

  it('shows an error state with a retry button when the call rejects', async () => {
    const getMetrics = vi.fn(async () => {
      throw new Error('boom')
    })
    setApi(getMetrics)
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(screen.getByText(/retry/i)).toBeInTheDocument())
    getMetrics.mockResolvedValueOnce(metrics())
    fireEvent.click(screen.getByText(/retry/i))
    await waitFor(() => expect(screen.getByTestId('throughput')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/dashboard/TodoDashboard.test.tsx`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 写实现**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { TodoDashboardMetrics, TodoDashboardRange } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '../../../i18n/translate'
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group'
import { ThroughputChart } from './ThroughputChart'
import { EstimateAccuracyChart } from './EstimateAccuracyChart'
import { CycleTimeCard } from './CycleTimeCard'
import { TokenCostCard } from './TokenCostCard'

const RANGES: TodoDashboardRange[] = ['7d', '30d', '90d', 'all']

function rangeLabel(range: TodoDashboardRange): string {
  if (range === 'all') {
    return translate('auto.components.todo.dashboard.TodoDashboard.rangeAll', 'All')
  }
  return range
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; metrics: TodoDashboardMetrics }

export function TodoDashboard({ projectId }: { projectId: string }): JSX.Element {
  const [range, setRange] = useState<TodoDashboardRange>('30d')
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    window.api.todos.dashboard
      .getMetrics({ projectId, range })
      .then((metrics) => setState({ kind: 'ready', metrics }))
      .catch(() => setState({ kind: 'error' }))
  }, [projectId, range])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <ToggleGroup
        type="single"
        value={range}
        onValueChange={(next) => {
          if (next) {
            setRange(next as TodoDashboardRange)
          }
        }}
      >
        {RANGES.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {rangeLabel(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {state.kind === 'loading' && (
        <div className="text-sm text-muted-foreground">
          {translate('auto.components.todo.dashboard.TodoDashboard.loading', 'Loading…')}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-start gap-2">
          <div className="text-sm text-muted-foreground">
            {translate('auto.components.todo.dashboard.TodoDashboard.error', 'Failed to load dashboard.')}
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-muted"
          >
            {translate('auto.components.todo.dashboard.TodoDashboard.retry', 'Retry')}
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.metrics.doneTaskCount === 0 && (
        <div className="text-sm text-muted-foreground">
          {translate('auto.components.todo.dashboard.TodoDashboard.empty', 'No completed tasks in this range.')}
        </div>
      )}

      {state.kind === 'ready' && state.metrics.doneTaskCount > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ThroughputChart data={state.metrics.throughput} />
          <CycleTimeCard stats={state.metrics.cycleTime} />
          <TokenCostCard summary={state.metrics.tokenCost} />
          <EstimateAccuracyChart data={state.metrics.estimateAccuracy} />
        </div>
      )}
    </div>
  )
}
```

> `ToggleGroup`/`ToggleGroupItem` 的导入路径与 props 以 `src/renderer/src/components/ui/toggle-group.tsx` 实际导出为准(grep 确认命名);相对层级按该目录既有组件对齐。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/dashboard/TodoDashboard.test.tsx`
Expected: PASS(4 测试)

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add src/renderer/src/components/todo/dashboard/TodoDashboard.tsx src/renderer/src/components/todo/dashboard/TodoDashboard.test.tsx
git commit -m "feat(todo-p4b): add TodoDashboard container"
```

---

## Task 12: TodoPage viewMode 集成 + 测试

TodoPage 加 `viewMode: 'board' | 'dashboard'` state + header `Tabs`;`detailItemId` 仍最优先;否则按 viewMode 渲染 `TodoBoard` / `TodoDashboard`。

**Files:**
- Modify: `src/renderer/src/components/todo/TodoPage.tsx`
- Test: `src/renderer/src/components/todo/TodoPage.test.tsx`(新增或在现有基础上追加 viewMode 用例)

- [ ] **Step 1: 先读现状,锚定插入点**

Run: `grep -n "detailItemId\|TodoBoard\|activeProjectId\|viewMode\|return (" src/renderer/src/components/todo/TodoPage.tsx | head -30`
目的:确认 `todoActiveProjectId` 的读取方式、header 区域 JSX、`TodoBoard` 渲染位置、detailItemId 分支。按实际结构落地下一步(以下为目标形态)。

- [ ] **Step 2: 写/追加失败测试**

```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TodoPage } from './TodoPage'

// 只测 viewMode 切换:mock 掉 board 与 dashboard 子树,避免 store/IPC 深依赖。
vi.mock('./TodoBoard', () => ({ TodoBoard: () => <div data-testid="board" /> }))
vi.mock('./dashboard/TodoDashboard', () => ({ TodoDashboard: () => <div data-testid="dashboard" /> }))

afterEach(() => {
  cleanup()
})

describe('TodoPage viewMode', () => {
  it('renders the board by default and switches to the dashboard tab', async () => {
    render(<TodoPage />)
    expect(screen.getByTestId('board')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/data/i))
    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument())
  })
})
```

> 如 TodoPage 依赖 zustand store 且无 projectId 时不渲染 board,测试需先经 store mock 提供一个 `todoActiveProjectId`。执行时按现有 TodoPage 测试(若有)的 store mock 范式补齐;若无既有范式,则在测试内 `vi.mock` 掉 store hook 返回一个固定 activeProjectId。此细节在 Step 1 grep 后确定。

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/TodoPage.test.tsx`
Expected: FAIL(尚无 Tabs / dashboard 分支)

- [ ] **Step 4: 改 TodoPage.tsx**

在 TodoPage 组件内加 viewMode state 与 Tabs(以下为目标补丁形态,按 Step 1 的真实结构对齐变量名):

```tsx
// 顶部导入区
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs'
import { TodoDashboard } from './dashboard/TodoDashboard'
import { translate } from '../../i18n/translate'

// 组件内、其他 useState 附近
const [viewMode, setViewMode] = useState<'board' | 'dashboard'>('board')
```

在 header(项目切换器旁)插入 Tabs:

```tsx
<Tabs value={viewMode} onValueChange={(next) => setViewMode(next as 'board' | 'dashboard')}>
  <TabsList>
    <TabsTrigger value="board">
      {translate('auto.components.todo.TodoPage.tabBoard', 'Board')}
    </TabsTrigger>
    <TabsTrigger value="dashboard">
      {translate('auto.components.todo.TodoPage.tabDashboard', 'Data')}
    </TabsTrigger>
  </TabsList>
</Tabs>
```

在正文渲染分支(保持 `detailItemId` 最优先):

```tsx
{detailItemId ? (
  <TodoDetailView /* 现有 props 原样保留 */ />
) : viewMode === 'dashboard' && activeProjectId ? (
  <TodoDashboard projectId={activeProjectId} />
) : (
  <TodoBoard /* 现有 props 原样保留 */ />
)}
```

> `activeProjectId`、`detailItemId`、`TodoBoard`/`TodoDetailView` 的真实变量名/props 以 Step 1 grep 结果为准,不要臆造。`Tabs`/`TabsList`/`TabsTrigger` 以 `src/renderer/src/components/ui/tabs.tsx` 实际导出为准。

- [ ] **Step 5: 运行确认通过 + typecheck**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/TodoPage.test.tsx`
Expected: PASS
Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit(仅在用户授权批量提交时)**

```bash
git add src/renderer/src/components/todo/TodoPage.tsx src/renderer/src/components/todo/TodoPage.test.tsx
git commit -m "feat(todo-p4b): add board/dashboard view toggle to TodoPage"
```

---

## Task 13: i18n 同步 + 全量验证门

**Files:**
- 运行本地化同步脚本(自动更新 catalog)
- 全量验证

- [ ] **Step 1: 同步本地化 catalog**

Run: `pnpm run sync:localization-catalog`
Expected: 新增的 `auto.components.todo.dashboard.*` 与 `auto.components.todo.TodoPage.tab*` key 被写入 catalog,无遗漏。

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: lint(含 max-lines ratchet / scrollbar / curly / 本地化覆盖)**

Run: `pnpm lint`
Expected: PASS。若 `check-styled-scrollbars` 报错 → 确认滚动容器 class 字面量含 `scrollbar-sleek`;若 `curly` 报错 → 补大括号;若本地化覆盖报错 → 重跑 Step 1 或补 key;若 max-lines 报错 → 拆分文件(禁止加豁免)。

- [ ] **Step 4: 跑本阶段全部测试**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-dashboard-worktree.test.ts src/main/todos/todo-dashboard-token.test.ts src/main/todos/todo-dashboard-metrics.test.ts src/main/todos/todo-dashboard-service.test.ts src/renderer/src/components/todo/dashboard/format-dashboard-values.test.ts src/renderer/src/components/todo/dashboard/ThroughputChart.test.tsx src/renderer/src/components/todo/dashboard/TodoDashboard.test.tsx src/renderer/src/components/todo/TodoPage.test.tsx`
Expected: 全绿。

- [ ] **Step 5: Commit(仅在用户授权批量提交时)**

```bash
git add -A
git commit -m "chore(todo-p4b): sync localization catalog for Done dashboard"
```

---

## Completion

全部任务完成、验证门全绿后:
- 使用 **superpowers:finishing-a-development-branch** 收尾(先跑测试确认通过 → 检测环境 → 呈现 4 个选项 → 执行选择)。
- 更新记忆 `project_todo_board_4phase_roadmap.md`:P4b(Done 数据看板)已完成,记录新增文件、验证结果、合并方式;四阶段路线图全部收官。

---

## Notes / 复用清单(实现时快速参照)

- `ClaudeUsageStore.getAutomationRunUsage(input: { worktreeId: string|null; terminalSessionId: string|null; startedAt: number|null; completedAt: number|null }): Promise<AutomationRunUsage>` — `src/main/claude-usage/store.ts:708`。内部对 `worktreeId` 有非空校验;匹配优先 `sessionId===terminalSessionId`,否则 worktreeId+时间窗;历史 `completedAt` 不强制重扫。
- `AutomationRunUsage`(`src/shared/automations-types.ts`)— `status: 'known'|'unavailable'`、`totalTokens: number|null`、`estimatedCostUsd: number|null`。
- `loadKnownUsageWorktreesByRepo(store: Pick<Store,'getAllWorktreeMeta'>, repos: Repo[]): Map<string, UsageWorktreeRef[]>`(`src/main/usage-worktree-metadata.ts:17`);`UsageWorktreeRef = { worktreeId, path, displayName }`;`store.getRepos()`(`src/main/persistence.ts:3766`)。
- `AcpSessionRecord`(`src/shared/acp/acp-session.ts`)— `{ engine: 'claude'|'qoder'|'cursor'; sessionId; cwd; startedAt; endedAt: string|null; ... }`。**无 codex 引擎**。
- `TodoRepository.listItems(projectId)` — 经 `runtime.getTodoRepository()`。
- `acpKernel.sessionManager.listSessions(taskId) as AcpSessionRecord[]` — P3/P4a 同款(`register-core-handlers.ts:214,222`)。
- `TodoItem`(`src/shared/todo/todo-item.ts`)— `id/identifier/title/status/estimate:number|null/createdAt/startedAt:string|null/completedAt:string|null`。
- shadcn 原语:`src/renderer/src/components/ui/tabs.tsx`、`toggle-group.tsx`;`--chart-1..5` / `--muted-foreground` / `--border` token 在 `main.css`。
