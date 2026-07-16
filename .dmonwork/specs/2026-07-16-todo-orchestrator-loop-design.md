# AutoPilot 编排循环（Symphony #1）设计 spec

- **日期**：2026-07-16
- **状态**：设计（已完成 brainstorming，待实现）
- **对标机制**：Symphony §8.1/§16.2「编排器 / 轮询-派发循环」（研究 spec 中的 #1，P0）
- **关联**：
  - 研究 spec：`.dmonwork/specs/2026-07-15-symphony-full-hosting-research.md`
  - 前置增量 #2（续接轮次）已于 2026-07-16 合并到 main（`acp-autopilot-runner.ts` 等）
- **目标**：在 orca 已有执行原语之上长出「协调层」，让被标记为可自主执行的看板任务无需人工点击即可被自动拾取并推进——完成 spec 定义的「第一增量 = #1 + #2」的后半部分。

---

## 1. 背景与范式

orca 的 AutoPilot 续接轮次（#2）已能让**单个**任务在一次派发后自我推进到 `human_review`。但派发仍是**人工驱动**的：用户必须打开 `EnterInProgressDialog` 点击 Start。缺失的是 Symphony「管理工作而非管理 Agent」的**编排层**——一个持续挑选待办、派发到空闲并发槽的循环。

本增量补齐这一层的**最小闭环**：一个主进程 tick 服务，扫描看板中被标记为可自主执行的任务，按序派发到有界并发槽，交给已有的续接运行器（#2）驱动至交接态。

**关键复用（不重建）**：
- `AcpSessionManager` + `autoPilotRunner`（续接循环本体，#2）
- `executeRouter.executeEnginePrompt`（派发入口）
- `todo-repository`（SQLite 持久化）
- `AutomationService` 已验证的 tick/重入守护形态（`src/main/automations/service.ts`）
- `acp:autopilot-progress` 进度广播

---

## 2. 已对齐的设计决策（brainstorming 结论）

| # | 设计问题（研究 spec §6） | 决策 |
|---|---|---|
| 范围 | 任务来源（Q7）| **仅手动看板任务**；外部 tracker 推迟到 #10 |
| 建模 | 「可自动执行」建模（Q2）| **TodoItem 上的持久化配置字段**（`autoPilotEnabled` + `autoPilotMaxTurns`），**不新增状态** |
| 触发面 | 调度触发面（Q1）| **主进程服务**，镜像 `AutomationService`，直接调 `executeRouter`（headless/SSH 友好，贴合「长驻自动化服务」终极目标）|
| 恢复 | 重启恢复（Q5）| **保留 `in_progress` 现状，不自动重跑**；按活跃 ACP session（而非状态）计算并发槽，死任务不占槽。真正的 session-resume 留给后续 #6 |
| 开关 | —— | **单一全局开关** `todoOrchestrator.enabled`（默认 off），任务级用 `autoPilotEnabled` 参与 |
| 并发 | 并发（#4 的最小子集）| 全局 `maxConcurrent`，默认 **2**，可在设置中调整。**不含**按状态限额 |
| 周期 | tick 周期 | **15s** 周期 tick + 事件触发即时重评估 |

---

## 3. 数据模型变更

### 3.1 TodoItem 新增字段（持久化）

在 `src/shared/todo/todo-item.ts` 的 `TodoItem`、`CreateTodoItemInput`、`UpdateTodoItemPatch` 上新增：

- `autoPilotEnabled: boolean` —— 任务是否参与自主拾取。默认 `false`。
- `autoPilotMaxTurns: number | null` —— 每任务的续接轮次上限；`null` 时回退到全局默认。

需同步：
- SQLite schema 迁移（新增 `auto_pilot_enabled INTEGER`、`auto_pilot_max_turns INTEGER`）——`src/main/todos/todo-database.ts`
- 行映射 —— `src/main/todos/todo-row-mapping.ts`（读写两侧，布尔↔0/1）
- repository 的 create/update/list 透传 —— `src/main/todos/todo-repository.ts`

### 3.2 全局编排配置（持久化）

复用现有 app 设置持久化（`src/main/persistence.ts` 的 PersistedState），新增一个 `todoOrchestrator` 配置块：

```ts
type TodoOrchestratorConfig = {
  enabled: boolean        // 默认 false —— 自主执行会花 token、改代码，必须 opt-in
  maxConcurrent: number   // 默认 2
  tickMs: number          // 默认 15000
  defaultMaxTurns: number // 默认 10 —— 任务 autoPilotMaxTurns 为 null 时的回退
}
```

---

## 4. 主进程服务：`TodoOrchestratorService`

新增 `src/main/todos/todo-orchestrator-service.ts`，镜像 `AutomationService` 的结构。

### 4.1 依赖注入（便于测试）

```ts
type OrchestratorDeps = {
  listCandidates: () => TodoItem[]          // repo: status==='todo' && autoPilotEnabled
  updateStatus: (id: string, status: TodoStatus) => void
  resolveCwd: (item: TodoItem) => string | null
  dispatch: (input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>
  getConfig: () => TodoOrchestratorConfig
  now?: () => number
}
```

- `dispatch` 内部即调 `executeRouter.executeEnginePrompt`（带 `autoPilot` 配置）。
- `resolveCwd` 从 `workspaceProjectId` + project.defaultWorkingDir + projectHostSetups 解析（把渲染层 `resolveWorkspaceProjectCwd` 的解析逻辑抽到主进程可用的共享/主进程 helper）。

### 4.2 生命周期与并发

```ts
class TodoOrchestratorService {
  private timer: Timer | null = null
  private evaluating = false
  private readonly liveSessions = new Set<string>()  // taskId 或 sessionId

  start(): void        // setInterval(tick, config.tickMs)，并立即 evaluate 一次
  stop(): void         // clearInterval
  notifyEligible(): void   // 事件触发：某任务 autoPilotEnabled 置 on → evaluate
  notifySessionEnded(taskId): void  // AutoPilot session 结束（成功/错误/取消）→ 移除并 evaluate
  trackSession(taskId): void
}
```

- **重入守护**：`evaluating` 布尔，正在评估时直接返回（与 `AutomationService.evaluateDueRuns` 一致）。
- **槽位计算**：`slots = config.maxConcurrent - liveSessions.size`；`slots <= 0` 直接返回。
- 活跃 session 以 orchestrator 自持的 `liveSessions` 集合为准，**不依赖任务状态**——保证崩溃后遗留的 `in_progress` 死任务不占槽（决策 §2 恢复项）。

### 4.3 tick 主逻辑

```
tick():
  if evaluating: return
  evaluating = true
  try:
    cfg = getConfig()
    if !cfg.enabled: return
    slots = cfg.maxConcurrent - liveSessions.size
    if slots <= 0: return
    candidates = listCandidates()
      .filter(c => !liveSessions.has(c.id))     // 防御：不重复派发
      .sort(byPriorityAscThenOrderKeyThenCreatedAt)
    for c in candidates.slice(0, slots):
      cwd = resolveCwd(c)
      if !cwd: continue                          // 尚不可启动，下个 tick 再试
      updateStatus(c.id, 'in_progress')
      trackSession(c.id)
      try:
        await dispatch({
          taskId: c.id,
          engine: c.preferredAgent ?? DEFAULT_ENGINE,
          prompt: buildBasePrompt(c),
          cwd,
          autoPilot: { maxTurns: c.autoPilotMaxTurns ?? cfg.defaultMaxTurns }
        })
      catch:
        liveSessions.delete(c.id)                // 派发失败即释放槽；任务留 in_progress 待人工
  finally:
    evaluating = false
```

- **排序**：`priority` 升序（越紧急越靠前）→ `orderKey`（看板顺序）→ `createdAt`（旧优先）。全部为 `TodoItem` 已有字段，镜像 Symphony §8.2，**去掉阻塞门禁**（orca 无任务间依赖模型，无数据可门禁）。
- **选取列**：仅 `status === 'todo' && autoPilotEnabled`；`backlog` 视为「未就绪」，不拾取。
- **prompt**：复用 `buildBasePrompt(item)`（title + description）；自主派发无「附加 prompt」。需把 `buildBasePrompt` 抽到共享位置供主进程调用。

---

## 5. 触发面：周期 + 事件

镜像 `AutomationService` 的「周期 tick + 关键事件即时评估」：

1. **周期**：`setInterval(config.tickMs)`，默认 15s；`start()` 时立即评估一次。
2. **事件即时评估**：
   - 任务 `autoPilotEnabled` 从 false → true（repository update 后触发 `notifyEligible`）。
   - AutoPilot session 结束（`autoPilotRunner` 的 finally / session close）→ `notifySessionEnded(taskId)` 释放槽并评估。

`autoPilotRunner` 已在 `finally { unmarkAutoPilot }` 处收口；在同处回调编排器的 `notifySessionEnded` 即可（通过注入的回调，避免主进程模块环依赖）。

---

## 6. 服务装配

在 app 启动装配处（与 `AutomationService` 实例化相邻，见 `src/main/index.ts` / startup）：
- 构造 `TodoOrchestratorService`，注入 repository、executeRouter、cwd 解析、config 读取。
- `app ready` 后 `start()`；退出时 `stop()`。
- 把 orchestrator 的 `notifySessionEnded` 回调接到 ACP kernel 的 AutoPilot 收口处。

---

## 7. UI 变更（最小）

- **任务级**：todo 卡片/详情上新增「AutoPilot eligible」开关，写 `autoPilotEnabled`（并可选设置该任务的 max turns）。
- **全局**：设置中新增编排开关（默认 off）+ 并发上限输入。
- 复用 #2 已有的运行中 badge（`InProgressPanel`）。
- **本地化**：所有新增用户可见文案走 `translate('key','English fallback')`，并同步 en/zh/ja/ko/es 五个 locale，附真实翻译。

---

## 8. 明确不做（推迟）

| 机制 | 优先级 | 推迟理由 |
|---|---|---|
| #3 指数退避重试 | P1 | 最小闭环不含重试；失败任务留 `in_progress` 待人工 |
| #4 按状态并发限额 | P1 | 本增量仅全局 `maxConcurrent` |
| #5 阻塞门禁 | P1 | orca 无任务间依赖数据模型 |
| #6 停滞检测 + tracker 状态对账 | P1 | 本增量不做真正的重启 resume/停滞杀进程 |
| #7 WORKFLOW.md 契约 | P2 | prompt 仍走 `buildBasePrompt`，暂不引入仓库自持契约 |
| #8 自动审批姿态 | P2 | 权限桥仍走现有超时抛人工 |
| #9 每任务 worktree 隔离 | P2 | 现流程在 project defaultWorkingDir 内运行，本增量不改 |
| #10 外部 tracker 来源 | P3 | 范围决策：仅手动看板 |

---

## 9. 测试策略（TDD）

在 Node 20 环境下**全量 vitest 会因 `Map.groupBy` / `node:sqlite` 环境性大面积失败**（项目要求 Node 24）——验证以 **typecheck + lint + 作用域测试文件** 为准，作用域测试用 `vitest run --config config/vitest.config.ts <file>`。

核心单测（依赖注入、纯逻辑，不依赖 Electron）：
1. `enabled=false` → tick 不派发。
2. `slots=0`（liveSessions 已满）→ 不派发。
3. 候选排序：priority → orderKey → createdAt 正确。
4. 只拾取 `status==='todo' && autoPilotEnabled` 的任务。
5. `resolveCwd` 返回 null → 跳过且不 flip 状态。
6. 派发成功 → flip `in_progress`、trackSession、占一个槽。
7. `dispatch` 抛错 → 释放槽、任务留 `in_progress`。
8. 重入守护：并发 tick 只评估一次。
9. `notifySessionEnded` → 释放槽并触发再评估。
10. 死任务（`in_progress` 但不在 liveSessions）不占槽、不被重复拾取。
11. row-mapping：`autoPilotEnabled`/`autoPilotMaxTurns` 读写往返（布尔↔0/1、null 透传）。
12. schema 迁移：旧行读出默认值（enabled=false、maxTurns=null）。

---

## 10. 交付边界（本增量 Done 的定义）

- TodoItem 两字段落库 + 迁移 + row-mapping + repository 透传，含测试。
- `TodoOrchestratorService` 全逻辑单测通过。
- 服务在启动装配、`autoPilotRunner` 收口回调接线。
- 全局配置读写 + 设置 UI 开关/并发输入。
- 任务级 eligible 开关 UI。
- 五 locale 本地化同步。
- `pnpm typecheck` + `pnpm lint` + 作用域测试全绿。
