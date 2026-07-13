# TODO Board P4b:Done 数据看板 — 设计

> 承接 P4a(merging 态真实 git 合并)。orca TODO 看板四阶段的最后一部分。

**日期**:2026-07-13
**阶段**:P4b(四阶段路线图最后一环)
**依赖**:P1(看板/持久化)、P2a(ACP 执行内核 + AcpSessionRecord)、claude-usage/codex-usage 模块

---

## 0. 目标与范围

在 TODO 页内提供一个 **Done 数据看板**,对当前项目已完成(`done`)的任务做量化呈现,帮助用户回顾吞吐、周期与成本。

**v1 展示四个指标**:
1. **吞吐量趋势** — 一段时间内完成的任务数(按天/周分桶)。
2. **周期时间** — 任务 `started → completed` 时长的平均/中位 + 样本。
3. **Token 成本** — 每任务及汇总的 token 用量 + `estimatedCostUsd`,**复用 claude-usage/codex-usage 的现成归因**。
4. **预估 vs 实际** — 散点图:X = 预估点数(story points,无单位),Y = 实际周期时长。

**明确不做(v1)**:
- Skill / SubAgent / MCP / 人工介入次数的**新增埋点**——一律不做。看板只消费**现有数据**(任务时间戳、estimate、以及 claude-usage 已聚合的 token)。
- 跨项目聚合、自定义日期区间、指标持久化落库(留待后续按需迭代)。

**约束**:
- 所有 UI 遵循 `docs/STYLEGUIDE.md`,用 `src/renderer/src/assets/main.css` 的 token(含 `--chart-1..5`)与 `src/renderer/src/components/ui/` 的 shadcn 原语,不造新色/新字号。
- `max-lines` ratchet:不加豁免,文件按职责拆分。
- 滚动容器必须带 Orca 滚动条类(`scrollbar-sleek`)。
- `curly`:所有 `if` 带大括号。
- 跨平台 / SSH / Git 版本兼容照旧(本阶段主要是读现有数据,无新 Git 命令)。

---

## 1. 挂载位置与交互

- 挂载点:`TodoPage.tsx`。header(项目切换器旁)加一个 `Tabs`:**看板 / 数据**,本地 `viewMode: 'board' | 'dashboard'` 控制。
- 作用域:**当前选中项目**(复用现有 `todoActiveProjectId`);跨项目留待后续。
- 优先级:`detailItemId` 仍最优先(打开任务详情走 `TodoDetailView`);否则按 `viewMode` 渲染 `TodoBoard` 或 `TodoDashboard`。
- 时间范围:看板内 `ToggleGroup` 预设 **7d / 30d / 90d / 全部**,默认 `30d`;切换即重新拉取。

---

## 2. 数据契约(shared 类型)

新增 `src/shared/todo/todo-dashboard.ts`:

```ts
export type TodoDashboardRange = '7d' | '30d' | '90d' | 'all'

// 吞吐量:7d/30d 按天分桶;90d/all 按周分桶(减少噪点)
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

**口径约定**:
- 样本 = `status === 'done'` 且 `completedAt` 落在 range 窗口内(`all` 不限时间)。`canceled` / `duplicate` 不计(符合"Done 看板"语义)。
- 零 done 任务时:`doneTaskCount = 0`,各数组为空、统计为 `null`,渲染层统一空态。
- `estimate` 是 Linear 式**无单位点数**,不是时长——因此"预估 vs 实际"以散点(点数 × 实际时长)呈现,不做单位换算。

---

## 3. 主进程聚合层(3 模块,纯函数可单测)

延续 P4a 的"纯函数 + 注入式 IO"拆分。

### ① `src/main/todos/todo-dashboard-metrics.ts` — 纯计算(零 IO)

```ts
export function computeTodoDashboardMetrics(input: {
  doneItems: TodoItem[] // 调用方已过滤 status==='done'
  tokenByTaskId: Map<string, TokenCostPerTask>
  range: TodoDashboardRange
  now: number
}): TodoDashboardMetrics
```

职责(全部确定性):range 窗口过滤(按 `completedAt`)、吞吐量分桶(天/周)、周期时间 average/median、预估散点组装、token 汇总累加。**不做任何 IO**,完整单测。

### ② `src/main/todos/todo-dashboard-token.ts` — 注入式 token 归因

```ts
export async function resolveTaskTokenCost(input: {
  item: TodoItem
  session: AcpSessionRecord | null
  worktreeId: string | null
  claudeUsage: ClaudeUsageStore | null
  codexUsage: CodexUsageStore | null
}): Promise<TokenCostPerTask>
```

职责:engine→provider 映射(`claude`→claudeUsage;`codex`→codexUsage;其余引擎 / 缺 session / 缺 worktreeId / store 为 null → `status:'unavailable'`),调 `usageStore.getAutomationRunUsage({ worktreeId, terminalSessionId: session.sessionId, startedAt, completedAt })`,把 `AutomationRunUsage` 收敛成 `TokenCostPerTask`。注入 store,mock 可单测。

> 复用依据:`src/main/automations/run-usage-collection.ts` 已用同一 `getAutomationRunUsage({worktreeId, terminalSessionId, startedAt, completedAt})` 归因;store 内部匹配支持 `session.sessionId === terminalSessionId` 直接命中,worktreeId 作时间窗兜底(但为非空必填校验)。

### ③ `src/main/todos/todo-dashboard-service.ts` — 编排(依赖注入)

输入 `{ projectId, range }`:
1. `repo.listItems(projectId)` → 过滤 `status==='done'`。
2. 每个 done 任务:经注入的 `sessionManager` 取该 `taskId` 最新 `AcpSessionRecord`。
3. `session.cwd` 经 `canonicalizePath` + `findContainingWorktree`(lookup 复用 `loadKnownUsageWorktreesByRepo`,见 `src/main/usage-worktree-metadata.ts`)解析 `worktreeId`;解析不到 → `null`。
4. `resolveTaskTokenCost(...)` → 收进 `Map<taskId, TokenCostPerTask>`。
5. `computeTodoDashboardMetrics({ doneItems, tokenByTaskId, range, now })` → 返回 DTO。

**性能**:`getAutomationRunUsage` 内部 `refresh` 对历史 `completedAt` 不强制重扫;首个任务触发一次扫描后,其余为内存态过滤。N 个 done 任务 ≈ 1 次扫描 + N 次内存匹配,v1 可接受;真遇瓶颈再批量化。

---

## 4. 瘦 IPC + preload 绑定

延续 P4a `todos:merge.*` 范式,新增单个只读 IPC。

**`src/main/ipc/todo-dashboard.ts`**
```ts
export function registerTodoDashboardHandlers(deps: {
  repo: TodoRepository
  sessionManager: AcpSessionManager
  claudeUsage: ClaudeUsageStore | null
  codexUsage: CodexUsageStore | null
}): void {
  ipcMain.handle(
    'todos:dashboard.getMetrics',
    (_e, args: { projectId: string; range: TodoDashboardRange }) =>
      buildTodoDashboardService(deps).getMetrics(args)
  )
}
```

**接线** `src/main/ipc/register-core-handlers.ts`:调用 `registerTodoDashboardHandlers`,注入 `acpKernel.sessionManager` 与模块级 `claudeUsage` / `codexUsage`(与 P4a merge 注入同处)。

**preload**:
- `src/preload/index.ts` — `todos.dashboard = { getMetrics: (args) => ipcRenderer.invoke('todos:dashboard.getMetrics', args) }`
- `src/preload/api-types.ts` — `todos.dashboard.getMetrics(args: { projectId: string; range: TodoDashboardRange }): Promise<TodoDashboardMetrics>`

只读、无副作用、一次往返。

---

## 5. 渲染层 UI

**改造 `TodoPage.tsx`**:加 `viewMode` state + header `Tabs`(看板/数据);`detailItemId` 优先,否则按 viewMode 渲染 `TodoBoard` / `TodoDashboard`。

**新增 `src/renderer/src/components/todo/dashboard/`**(每文件单一职责,控 max-lines):

- **`TodoDashboard.tsx`** — 容器。props `{ projectId }`,本地 `range`(默认 `'30d'`),`useEffect` 调 `window.api.todos.dashboard.getMetrics`,loading / error / ready 状态机。顶部 `ToggleGroup` 放 7/30/90/全部;body 用 grid 排四张卡。`doneTaskCount===0` → 统一空态文案。
- **`ThroughputChart.tsx`** — recharts `BarChart`,X=bucket、Y=count。
- **`CycleTimeCard.tsx`** — 平均/中位数字卡(`formatDuration`)+ 样本列表(滚动区 `scrollbar-sleek`)。
- **`TokenCostCard.tsx`** — 汇总(totalTokens + `estimatedCostUsd` + known/unavailable 计数)+ perTask 列表(滚动区 `scrollbar-sleek`);unavailable 任务灰显标注。
- **`EstimateAccuracyChart.tsx`** — recharts `ScatterChart`,X=estimatePoints、Y=actualMs 转小时。
- **`format-dashboard-values.ts`** — 纯函数 `formatDuration(ms)` / `formatTokens(n)` / `formatUsd(n)`,可单测。

**依赖**:新增 `recharts`(shadcn chart 底座)。
**着色**:recharts 系列色用 `var(--chart-1..5)`;文字/网格用 `--muted-foreground` 等语义 token,不造新色。
**i18n**:文案走 `translate('auto.components.todo.dashboard.<Comp>.<key>', 'English')`,随后跑 `pnpm run sync:localization-catalog`。

---

## 6. 错误处理与边界

- IPC 抛错 → 容器 error 态 + 重试按钮(translate 文案)。
- 单任务 token 归因失败 → 仅该任务 `unavailable`,不影响整体(归因层已降级)。
- `usageStore` 为 null(未启用)→ 全部 token `unavailable`,但吞吐量/周期/预估**照常**(不依赖 usage)。
- 零 done 任务 → 统一空态。
- 缺 `startedAt` → 周期用 `createdAt` 兜底;缺 estimate 或缺周期 → 不进散点。
- range 切换 → 重新拉取。

---

## 7. 测试策略(TDD)

- **纯函数** `computeTodoDashboardMetrics`(node):range 过滤、天/周分桶、average/median、空态、散点筛选。
- **`resolveTaskTokenCost`**(node,注入 mock usage store):claude 命中 known;非 claude/codex 引擎、缺 session、缺 worktreeId、store 为 null → unavailable。
- **`format-dashboard-values`**(node):时长/token/USD 格式化。
- **service 编排**(node,注入 mock repo/sessionManager/usage):done 过滤 + 组装冒烟。
- **渲染层**(happy-dom + `window.api` mock + `afterEach(cleanup)`):`TodoDashboard` loading→ready、range 切换重拉、空态、error 态;`TodoPage` viewMode 切换。
- **recharts 测试坑**:happy-dom 无 `ResizeObserver`/布局尺寸,`ResponsiveContainer` 渲染空 → 容器测试 `vi.mock` 掉四个图表子组件只测容器逻辑;图表子组件各做最小冒烟(传数据不崩,mock `ResizeObserver`)。

**验证门**:`pnpm typecheck` + `pnpm lint`(max-lines ratchet / scrollbar / curly / 本地化覆盖)+ `npx vitest run --config config/vitest.config.ts <相关文件>`。

---

## 8. 文件清单

**新增**:
- `src/shared/todo/todo-dashboard.ts`(类型)
- `src/main/todos/todo-dashboard-metrics.ts` + `.test.ts`
- `src/main/todos/todo-dashboard-token.ts` + `.test.ts`
- `src/main/todos/todo-dashboard-service.ts` + `.test.ts`
- `src/main/ipc/todo-dashboard.ts`
- `src/renderer/src/components/todo/dashboard/TodoDashboard.tsx` + `.test.tsx`
- `src/renderer/src/components/todo/dashboard/ThroughputChart.tsx`
- `src/renderer/src/components/todo/dashboard/CycleTimeCard.tsx`
- `src/renderer/src/components/todo/dashboard/TokenCostCard.tsx`
- `src/renderer/src/components/todo/dashboard/EstimateAccuracyChart.tsx`
- `src/renderer/src/components/todo/dashboard/format-dashboard-values.ts` + `.test.ts`

**修改**:
- `src/main/ipc/register-core-handlers.ts`(注册 handler)
- `src/preload/index.ts` + `src/preload/api-types.ts`(绑定)
- `src/renderer/src/components/todo/TodoPage.tsx`(viewMode + Tabs)
- `package.json`(新增 recharts 依赖)

---

## 9. 依赖复用清单(避免重复造)

- `ClaudeUsageStore.getAutomationRunUsage` / `CodexUsageStore.getAutomationRunUsage` — token 归因入口。
- `AutomationRunUsage`(`src/shared/automations-types.ts`)— token/成本返回结构。
- `run-usage-collection.ts` — 归因调用范式参照。
- `loadKnownUsageWorktreesByRepo`(`src/main/usage-worktree-metadata.ts`)+ `findContainingWorktree` — cwd→worktreeId 解析。
- `AcpSessionRecord`(`src/shared/acp/acp-session.ts`)— taskId→sessionId/cwd/时间。
- `TodoRepository.listItems`(`src/main/todos/todo-repository.ts`)— 项目任务查询。
- `Tabs` / `ToggleGroup`(`src/renderer/src/components/ui/`)、`--chart-1..5` token(`main.css`)。
