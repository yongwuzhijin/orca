# AutoPilot 编排循环（Symphony #1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主进程长出一个 tick 驱动的 `TodoOrchestratorService`，自动拾取看板中被标记为可自主执行的任务并派发到有界并发槽，交给已有的 AutoPilot 续接运行器推进到交接态，无需人工点击 Start。

**Architecture:** 复用 `AutomationService` 的主进程 tick 形态（`setInterval` + `evaluating` 重入守护 + `start/stop`）。核心服务纯依赖注入、无 Electron 耦合，便于单测。并发槽通过 dispatch promise 的 `.finally()` 内在释放——因为 `autoPilotRunner.run()` 只在整个续接循环结束时才 resolve，所以派发 promise 的生命周期天然等于一次 AutoPilot 运行的生命周期，无需向 runner 的 finally 注入回调。任务「可自主执行」建模为 `TodoItem` 上两个持久化字段（`autoPilotEnabled` + `autoPilotMaxTurns`），不新增状态。全局开关默认 off。

**Tech Stack:** Electron 主进程 (TypeScript)、SQLite (`sync-database`)、React/Zustand 渲染层、Vitest、i18n `translate('key','English fallback')` × 5 locale (en/zh/ja/ko/es)。

**关联文档：**
- 设计 spec：`.dmonwork/specs/2026-07-16-todo-orchestrator-loop-design.md`
- 研究 spec：`.dmonwork/specs/2026-07-15-symphony-full-hosting-research.md`

**验证约定（重要）：** Node 20 环境下全量 vitest 会因 `Map.groupBy` / `node:sqlite` 大面积失败（项目要求 Node 24）——这些是环境性失败，非回归。每个任务的验证以 **作用域测试文件** 为准：`npx vitest run --config config/vitest.config.ts <file>`。收尾统一跑 `pnpm typecheck` + `pnpm lint`。

---

## File Structure

**新建文件：**
- `src/main/todos/todo-orchestrator-candidate-order.ts` — 纯排序函数（priority → orderKey → createdAt）。
- `src/main/todos/todo-orchestrator-candidate-order.test.ts` — 排序单测。
- `src/main/todos/todo-orchestrator-service.ts` — `TodoOrchestratorService`（DI、tick、并发槽）。
- `src/main/todos/todo-orchestrator-service.test.ts` — 服务全逻辑单测。
- `src/shared/todo/todo-orchestrator-config.ts` — `TodoOrchestratorConfig` 类型 + 默认值常量。
- `src/shared/todo/workspace-project-cwd.ts` — 抽取自 renderer 的 `resolveWorkspaceProjectCwd`（主进程 + 渲染层共享）。
- `src/shared/todo/todo-base-prompt.ts` — 抽取自 renderer 的 `buildBasePrompt` / `composePrompt`（主进程 + 渲染层共享）。

**修改文件：**
- `src/shared/todo/todo-item.ts` — 三个类型加 `autoPilotEnabled` / `autoPilotMaxTurns`。
- `src/main/todos/todo-database.ts` — SCHEMA_VERSION → 5、CREATE TABLE 两列、v5 迁移。
- `src/main/todos/todo-row-mapping.ts` — row 类型 + `rowToTodoItem` 两字段映射。
- `src/main/todos/todo-repository.ts` — create/update 透传 + `listAutoPilotCandidates()`。
- `src/main/todos/todo-database.test.ts`（若不存在则新建）— v5 迁移测试。
- `src/main/todos/todo-repository.test.ts`（若不存在则新建）— 字段往返 + candidates 查询测试。
- `src/shared/types.ts` — `GlobalSettings` 加 `todoOrchestrator` 块。
- `src/shared/constants.ts` — 默认 settings 加 `todoOrchestrator`。
- `src/renderer/src/components/todo/TodoWorkspaceProjectPicker.tsx` — 改为 re-export 共享 `resolveWorkspaceProjectCwd`。
- `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx` — 改为 re-export 共享 `buildBasePrompt`/`composePrompt`。
- `src/main/runtime/orca-runtime.ts` — `getTodoOrchestratorService()`。
- `src/main/index.ts` — 服务 start/stop 装配。
- UI + i18n（Layer F）。

---

## Layer A — 数据模型

### Task 1: TodoItem 两个新字段（shared 类型）

**Files:**
- Modify: `src/shared/todo/todo-item.ts`

- [ ] **Step 1: 修改类型**

在 `TodoItem` 里 `sessionId: string | null` 之后新增：

```ts
  /** Whether this task participates in autonomous orchestrator pickup. Default false. */
  autoPilotEnabled: boolean
  /** Per-task continuation turn cap; null falls back to the global default. */
  autoPilotMaxTurns: number | null
```

在 `CreateTodoItemInput` 里 `preferredAgent?: AcpEngine | null` 之后新增：

```ts
  autoPilotEnabled?: boolean
  autoPilotMaxTurns?: number | null
```

在 `UpdateTodoItemPatch` 里 `preferredAgent?: AcpEngine | null` 之后新增：

```ts
  autoPilotEnabled?: boolean
  autoPilotMaxTurns?: number | null
```

- [ ] **Step 2: typecheck**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: 报错集中在 `todo-database.ts` / `todo-row-mapping.ts` / `todo-repository.ts`（下游还没加字段）——预期，Task 2/3 修复。类型文件本身无语法错误即可。

- [ ] **Step 3: Commit**

```bash
git add src/shared/todo/todo-item.ts
git commit -m "feat(todo): add autoPilot fields to TodoItem types"
```

---

### Task 2: SQLite schema v5 迁移 + row 映射

**Files:**
- Modify: `src/main/todos/todo-database.ts`
- Modify: `src/main/todos/todo-row-mapping.ts`
- Test: `src/main/todos/todo-database.test.ts`

- [ ] **Step 1: 写失败测试（迁移）**

在 `src/main/todos/todo-database.test.ts` 追加（若文件不存在则新建，import 见下）：

```ts
import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, TodoDatabase } from './todo-database'

describe('TodoDatabase autopilot migration (v5)', () => {
  it('exposes auto_pilot columns on a fresh DB', () => {
    const db = new TodoDatabase(':memory:')
    const cols = db.raw.pragma('table_info(todo_items)') as { name: string }[]
    const names = cols.map((c) => c.name)
    expect(names).toContain('auto_pilot_enabled')
    expect(names).toContain('auto_pilot_max_turns')
    db.close()
  })

  it('bumps SCHEMA_VERSION to 5', () => {
    expect(SCHEMA_VERSION).toBe(5)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-database.test.ts`
Expected: FAIL —— SCHEMA_VERSION 仍是 4，列不存在。

- [ ] **Step 3: 实现迁移**

在 `todo-database.ts`：把 `export const SCHEMA_VERSION = 4` 改为 `5`。更新顶部注释，追加一行：`// v5 adds auto_pilot_enabled / auto_pilot_max_turns on todo_items for the orchestrator.`

在 `ensureSchema()` 的 `CREATE TABLE IF NOT EXISTS todo_items (...)` 里，`preferred_agent TEXT` 之后加两列：

```
        preferred_agent TEXT,
        auto_pilot_enabled INTEGER NOT NULL DEFAULT 0,
        auto_pilot_max_turns INTEGER
```

在 `migrate()` 的 v4 块之后、`this.db.pragma(\`user_version = ...\`)` 之前新增：

```ts
      // v5: orchestrator eligibility + per-task turn cap.
      if (current < 5) {
        if (!this.hasColumn('todo_items', 'auto_pilot_enabled')) {
          this.db.exec(
            'ALTER TABLE todo_items ADD COLUMN auto_pilot_enabled INTEGER NOT NULL DEFAULT 0'
          )
        }
        if (!this.hasColumn('todo_items', 'auto_pilot_max_turns')) {
          this.db.exec('ALTER TABLE todo_items ADD COLUMN auto_pilot_max_turns INTEGER')
        }
      }
```

- [ ] **Step 4: 运行迁移测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-database.test.ts`
Expected: PASS

- [ ] **Step 5: 更新 row 映射**

在 `todo-row-mapping.ts` 的 `TodoItemRow` 里 `preferred_agent: string | null` 之后加：

```ts
  auto_pilot_enabled: number
  auto_pilot_max_turns: number | null
```

在 `rowToTodoItem()` 返回对象里 `preferredAgent: ...` 之后加：

```ts
    autoPilotEnabled: row.auto_pilot_enabled === 1,
    autoPilotMaxTurns: row.auto_pilot_max_turns
```

- [ ] **Step 6: typecheck**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: 只剩 `todo-repository.ts` 相关报错（Task 3 修复），映射/数据库文件无报错。

- [ ] **Step 7: Commit**

```bash
git add src/main/todos/todo-database.ts src/main/todos/todo-row-mapping.ts src/main/todos/todo-database.test.ts
git commit -m "feat(todo): persist autoPilot fields with schema v5 migration"
```

---

### Task 3: repository 透传 + `listAutoPilotCandidates()`

**Files:**
- Modify: `src/main/todos/todo-repository.ts`
- Test: `src/main/todos/todo-repository.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/main/todos/todo-repository.test.ts` 追加（若不存在则新建，用 `TodoDatabase(':memory:')` 直接构造 repo）：

```ts
import { describe, expect, it } from 'vitest'
import { TodoDatabase } from './todo-database'
import { TodoRepository } from './todo-repository'
import { DEFAULT_TODO_PROJECT_ID } from '../../shared/todo/todo-default-project'

function makeRepo(): TodoRepository {
  const repo = new TodoRepository(new TodoDatabase(':memory:'))
  repo.ensureDefaultProject()
  return repo
}

describe('TodoRepository autoPilot fields', () => {
  it('defaults autoPilotEnabled=false and autoPilotMaxTurns=null on create', () => {
    const repo = makeRepo()
    const item = repo.createItem({ projectId: DEFAULT_TODO_PROJECT_ID, title: 'x' })
    expect(item.autoPilotEnabled).toBe(false)
    expect(item.autoPilotMaxTurns).toBeNull()
  })

  it('round-trips autoPilot fields through create + update', () => {
    const repo = makeRepo()
    const created = repo.createItem({
      projectId: DEFAULT_TODO_PROJECT_ID,
      title: 'x',
      autoPilotEnabled: true,
      autoPilotMaxTurns: 7
    })
    expect(created.autoPilotEnabled).toBe(true)
    expect(created.autoPilotMaxTurns).toBe(7)
    const updated = repo.updateItem(created.id, { autoPilotEnabled: false, autoPilotMaxTurns: null })
    expect(updated.autoPilotEnabled).toBe(false)
    expect(updated.autoPilotMaxTurns).toBeNull()
  })

  it('listAutoPilotCandidates returns only status=todo && autoPilotEnabled across projects', () => {
    const repo = makeRepo()
    const eligible = repo.createItem({
      projectId: DEFAULT_TODO_PROJECT_ID,
      title: 'eligible',
      status: 'todo',
      autoPilotEnabled: true
    })
    repo.createItem({ projectId: DEFAULT_TODO_PROJECT_ID, title: 'todo-no-flag', status: 'todo' })
    repo.createItem({
      projectId: DEFAULT_TODO_PROJECT_ID,
      title: 'backlog-flag',
      status: 'backlog',
      autoPilotEnabled: true
    })
    const candidates = repo.listAutoPilotCandidates()
    expect(candidates.map((c) => c.id)).toEqual([eligible.id])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-repository.test.ts`
Expected: FAIL —— create 不接受新字段、`listAutoPilotCandidates` 未定义。

- [ ] **Step 3: 实现透传（createItem）**

在 `createItem` 的局部变量区（`const preferredAgent = ...` 之后）加：

```ts
    const autoPilotEnabled = input.autoPilotEnabled ?? false
    const autoPilotMaxTurns = input.autoPilotMaxTurns ?? null
```

把 INSERT 的列清单结尾 `preferred_agent` 改为：

```
            workspace_project_id, workspace_name, preferred_agent,
            auto_pilot_enabled, auto_pilot_max_turns
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
```

（注意：占位符从 20 个增至 22 个。）在 `.run(...)` 末尾 `preferredAgent` 之后加：

```ts
          preferredAgent,
          autoPilotEnabled ? 1 : 0,
          autoPilotMaxTurns
```

- [ ] **Step 4: 实现透传（updateItem）**

在 `updateItem` 的局部变量区（`const preferredAgent = ...` 之后）加：

```ts
    const autoPilotEnabled =
      patch.autoPilotEnabled !== undefined ? patch.autoPilotEnabled : current.autoPilotEnabled
    const autoPilotMaxTurns =
      patch.autoPilotMaxTurns !== undefined ? patch.autoPilotMaxTurns : current.autoPilotMaxTurns
```

把 UPDATE 语句的 SET 列表里 `preferred_agent = ?,` 之后加 `auto_pilot_enabled = ?, auto_pilot_max_turns = ?,`。在 `.run(...)` 里 `preferredAgent,` 之后加：

```ts
        preferredAgent,
        autoPilotEnabled ? 1 : 0,
        autoPilotMaxTurns,
```

- [ ] **Step 5: 实现 `listAutoPilotCandidates()`**

在 `listItems` 之后新增方法：

```ts
  // Why: the orchestrator picks across all projects, not one board — status must
  // be 'todo' (backlog is "not ready") and the task must be eligible. Ordered by
  // order_key only as a stable secondary; the service applies the full priority sort.
  listAutoPilotCandidates(): TodoItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM todo_items
         WHERE status = 'todo' AND auto_pilot_enabled = 1
         ORDER BY order_key ASC`
      )
      .all() as TodoItemRow[]
    return rows.map(rowToTodoItem)
  }
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-repository.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/main/todos/todo-repository.ts src/main/todos/todo-repository.test.ts
git commit -m "feat(todo): transceive autoPilot fields and add listAutoPilotCandidates"
```

---

## Layer B — 共享抽取（供主进程调用）

### Task 4: 抽取 `resolveWorkspaceProjectCwd` 到 shared

**Files:**
- Create: `src/shared/todo/workspace-project-cwd.ts`
- Modify: `src/renderer/src/components/todo/TodoWorkspaceProjectPicker.tsx`

- [ ] **Step 1: 创建共享模块**

`src/shared/todo/workspace-project-cwd.ts`：

```ts
import type { ProjectHostSetup } from '../types'

// Why: shared between the renderer Start dialog and the main-process orchestrator
// so both resolve a task's cwd identically (ready host setup path → fallback).
export function resolveWorkspaceProjectCwd(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[],
  fallbackCwd?: string | null
): string {
  if (workspaceProjectId) {
    const ready = projectHostSetups.find(
      (setup) => setup.projectId === workspaceProjectId && setup.setupState === 'ready'
    )
    if (ready?.path) {
      return ready.path
    }
  }
  return fallbackCwd?.trim() ?? ''
}
```

- [ ] **Step 2: 渲染层改为 re-export**

在 `TodoWorkspaceProjectPicker.tsx` 删除本地 `resolveWorkspaceProjectCwd` 函数定义（14-28 行），改为在文件顶部 import 区之后加：

```ts
export { resolveWorkspaceProjectCwd } from '../../../../shared/todo/workspace-project-cwd'
```

并删除文件顶部现在无用的 `import type { ProjectHostSetup } from '../../../../shared/types'`（若仅此函数使用）。

- [ ] **Step 3: typecheck（web + node）**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.tc.web.json && pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: PASS（EnterInProgressDialog 仍从 picker import 该函数，re-export 保持可用）。

- [ ] **Step 4: Commit**

```bash
git add src/shared/todo/workspace-project-cwd.ts src/renderer/src/components/todo/TodoWorkspaceProjectPicker.tsx
git commit -m "refactor(todo): extract resolveWorkspaceProjectCwd to shared module"
```

---

### Task 5: 抽取 `buildBasePrompt` / `composePrompt` 到 shared

**Files:**
- Create: `src/shared/todo/todo-base-prompt.ts`
- Modify: `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx`

- [ ] **Step 1: 创建共享模块**

`src/shared/todo/todo-base-prompt.ts`：

```ts
import type { TodoItem } from './todo-item'

// Why: shared by the renderer Start dialog and the main-process orchestrator so
// autonomous dispatch builds the exact same prompt a manual Start would.
export function buildBasePrompt(item: TodoItem): string {
  const title = item.title.trimEnd()
  const description = item.description.trim()
  // Why: create flow often seeds description from title; concatenating both duplicates the prompt.
  if (!description || description === title.trim()) {
    return title
  }
  return `${title}\n\n${description}`
}

export function composePrompt(base: string, extra: string): string {
  const trimmed = extra.trim()
  return trimmed ? `${base}\n\n${trimmed}` : base
}
```

- [ ] **Step 2: 渲染层改为 re-export**

在 `EnterInProgressDialog.tsx` 删除本地 `buildBasePrompt`（14-22 行）与 `composePrompt`（24-27 行）定义，在 import 区之后加：

```ts
export { buildBasePrompt, composePrompt } from '../../../../../shared/todo/todo-base-prompt'
```

组件体内 `buildBasePrompt(item)` / `composePrompt(base, extra)` 调用保持不变。

- [ ] **Step 3: typecheck（web）**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.tc.web.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/todo/todo-base-prompt.ts src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx
git commit -m "refactor(todo): extract buildBasePrompt/composePrompt to shared module"
```

---

## Layer D — 全局配置

### Task 6: `TodoOrchestratorConfig` 类型 + 默认值

**Files:**
- Create: `src/shared/todo/todo-orchestrator-config.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: 创建 config 模块**

`src/shared/todo/todo-orchestrator-config.ts`：

```ts
export type TodoOrchestratorConfig = {
  /** Master switch. Off by default — autonomous runs spend tokens and change code. */
  enabled: boolean
  /** Global concurrent AutoPilot dispatches. */
  maxConcurrent: number
  /** Poll cadence in ms. */
  tickMs: number
  /** Fallback continuation cap when a task's autoPilotMaxTurns is null. */
  defaultMaxTurns: number
}

export const DEFAULT_TODO_ORCHESTRATOR_CONFIG: TodoOrchestratorConfig = {
  enabled: false,
  maxConcurrent: 2,
  tickMs: 15_000,
  defaultMaxTurns: 10
}
```

- [ ] **Step 2: GlobalSettings 加字段**

在 `src/shared/types.ts` 的 `GlobalSettings` 里 `keepComputerAwakeWhileAgentsRun: boolean` 之后加：

```ts
  /** Autonomous TODO orchestrator loop config (Symphony #1). Off by default. */
  todoOrchestrator: TodoOrchestratorConfig
```

在 `types.ts` 顶部 import 区加：

```ts
import type { TodoOrchestratorConfig } from './todo/todo-orchestrator-config'
```

- [ ] **Step 3: 默认值**

在 `src/shared/constants.ts` 默认 settings 对象里 `keepComputerAwakeWhileAgentsRun: false,` 之后加：

```ts
    todoOrchestrator: { ...DEFAULT_TODO_ORCHESTRATOR_CONFIG },
```

在 `constants.ts` 顶部 import 区加：

```ts
import { DEFAULT_TODO_ORCHESTRATOR_CONFIG } from './todo/todo-orchestrator-config'
```

- [ ] **Step 4: typecheck**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/todo/todo-orchestrator-config.ts src/shared/types.ts src/shared/constants.ts
git commit -m "feat(todo): add todoOrchestrator global settings config"
```

---

## Layer C — 编排服务（纯逻辑，DI）

### Task 7: 候选排序函数

**Files:**
- Create: `src/main/todos/todo-orchestrator-candidate-order.ts`
- Test: `src/main/todos/todo-orchestrator-candidate-order.test.ts`

- [ ] **Step 1: 写失败测试**

`src/main/todos/todo-orchestrator-candidate-order.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-orchestrator-candidate-order.test.ts`
Expected: FAIL —— 函数未定义。

- [ ] **Step 3: 实现排序**

`src/main/todos/todo-orchestrator-candidate-order.ts`：

```ts
import type { TodoItem } from '../../shared/todo/todo-item'
import { TODO_PRIORITIES } from '../../shared/todo/todo-priority'

// Why: TODO_PRIORITIES is ['none','low','medium','high','urgent']; urgent is the
// most pressing, so higher index must sort first (rank = negative index).
function priorityRank(item: TodoItem): number {
  return -TODO_PRIORITIES.indexOf(item.priority)
}

// Mirrors Symphony §8.2 candidate ordering, minus the blocking gate (orca has no
// task-dependency model). Pure + non-mutating (spreads before sort).
export function sortAutoPilotCandidates(items: readonly TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    const byPriority = priorityRank(a) - priorityRank(b)
    if (byPriority !== 0) {
      return byPriority
    }
    if (a.orderKey !== b.orderKey) {
      return a.orderKey < b.orderKey ? -1 : 1
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1
    }
    return 0
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-orchestrator-candidate-order.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/todos/todo-orchestrator-candidate-order.ts src/main/todos/todo-orchestrator-candidate-order.test.ts
git commit -m "feat(todo): add orchestrator candidate ordering"
```

---

### Task 8: `TodoOrchestratorService` 核心 tick + 并发槽 + 重入守护

**Files:**
- Create: `src/main/todos/todo-orchestrator-service.ts`
- Test: `src/main/todos/todo-orchestrator-service.test.ts`

- [ ] **Step 1: 写失败测试（enabled=false / 排序派发 / cwd=null 跳过 / dispatch 抛错释放槽）**

`src/main/todos/todo-orchestrator-service.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import type { TodoItem } from '../../shared/todo/todo-item'
import type { TodoOrchestratorConfig } from '../../shared/todo/todo-orchestrator-config'
import {
  TodoOrchestratorService,
  type OrchestratorDeps
} from './todo-orchestrator-service'

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

const cfg = (over: Partial<TodoOrchestratorConfig> = {}): TodoOrchestratorConfig => ({
  enabled: true,
  maxConcurrent: 2,
  tickMs: 15_000,
  defaultMaxTurns: 10,
  ...over
})

// A deferred dispatch we can resolve manually to control slot lifetime.
function deferredDispatch() {
  const resolvers: Array<(v: { sessionId: string }) => void> = []
  const fn = vi.fn(
    () => new Promise<{ sessionId: string }>((res) => resolvers.push(res))
  )
  return { fn, resolveNext: () => resolvers.shift()?.({ sessionId: 's' }) }
}

function makeService(over: Partial<OrchestratorDeps>): {
  service: TodoOrchestratorService
  deps: OrchestratorDeps
} {
  const deps: OrchestratorDeps = {
    listCandidates: () => [],
    updateStatus: vi.fn(),
    resolveCwd: () => '/repo',
    dispatch: vi.fn(async () => ({ sessionId: 's' })),
    getConfig: () => cfg(),
    ...over
  }
  return { service: new TodoOrchestratorService(deps), deps }
}

describe('TodoOrchestratorService.tick', () => {
  it('does nothing when disabled', async () => {
    const dispatch = vi.fn(async () => ({ sessionId: 's' }))
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a' })],
      getConfig: () => cfg({ enabled: false }),
      dispatch
    })
    await service.tick()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches candidates in sorted order up to available slots', async () => {
    const dispatch = vi.fn(async () => ({ sessionId: 's' }))
    const { service } = makeService({
      listCandidates: () => [
        item({ id: 'low', priority: 'low' }),
        item({ id: 'urgent', priority: 'urgent' }),
        item({ id: 'none', priority: 'none' })
      ],
      getConfig: () => cfg({ maxConcurrent: 2 }),
      dispatch
    })
    await service.tick()
    expect(dispatch.mock.calls.map((c) => c[0].taskId)).toEqual(['urgent', 'low'])
  })

  it('flips status to in_progress and passes prompt/cwd/autoPilot on dispatch', async () => {
    const updateStatus = vi.fn()
    const dispatch = vi.fn(async () => ({ sessionId: 's' }))
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a', preferredAgent: 'qoder', autoPilotMaxTurns: 3 })],
      updateStatus,
      resolveCwd: () => '/work',
      dispatch,
      getConfig: () => cfg({ maxConcurrent: 1, defaultMaxTurns: 10 })
    })
    await service.tick()
    expect(updateStatus).toHaveBeenCalledWith('a', 'in_progress')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'a',
        engine: 'qoder',
        cwd: '/work',
        autoPilot: { maxTurns: 3 }
      })
    )
  })

  it('falls back to defaultMaxTurns when task autoPilotMaxTurns is null', async () => {
    const dispatch = vi.fn(async () => ({ sessionId: 's' }))
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a', autoPilotMaxTurns: null })],
      dispatch,
      getConfig: () => cfg({ maxConcurrent: 1, defaultMaxTurns: 9 })
    })
    await service.tick()
    expect(dispatch.mock.calls[0][0].autoPilot).toEqual({ maxTurns: 9 })
  })

  it('skips a candidate whose cwd cannot resolve, without flipping status', async () => {
    const updateStatus = vi.fn()
    const dispatch = vi.fn(async () => ({ sessionId: 's' }))
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a' })],
      resolveCwd: () => null,
      updateStatus,
      dispatch
    })
    await service.tick()
    expect(dispatch).not.toHaveBeenCalled()
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('holds a slot for the whole dispatch and frees it on resolve', async () => {
    const { fn, resolveNext } = deferredDispatch()
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a' }), item({ id: 'b', orderKey: 'n' })],
      getConfig: () => cfg({ maxConcurrent: 1 }),
      dispatch: fn
    })
    await service.tick() // dispatches 'a', slot full
    expect(fn).toHaveBeenCalledTimes(1)
    await service.tick() // no free slot
    expect(fn).toHaveBeenCalledTimes(1)
    resolveNext() // 'a' finishes → slot frees → re-evaluate dispatches 'b'
    await Promise.resolve()
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[1][0].taskId).toBe('b')
  })

  it('releases the slot and leaves status when dispatch rejects', async () => {
    const dispatch = vi.fn(async () => {
      throw new Error('boom')
    })
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a' })],
      getConfig: () => cfg({ maxConcurrent: 1 }),
      dispatch
    })
    await service.tick()
    await Promise.resolve()
    await Promise.resolve()
    // slot freed → a fresh tick with the same (still-todo in real life) candidate
    // would dispatch again; here the candidate list is static so just assert no throw
    // and that liveCount is back to 0 via a second dispatch attempt.
    await service.tick()
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('does not re-dispatch a candidate already live', async () => {
    const { fn } = deferredDispatch()
    const { service } = makeService({
      listCandidates: () => [item({ id: 'a' })],
      getConfig: () => cfg({ maxConcurrent: 2 }),
      dispatch: fn
    })
    await service.tick()
    await service.tick()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-orchestrator-service.test.ts`
Expected: FAIL —— 服务未定义。

- [ ] **Step 3: 实现服务**

`src/main/todos/todo-orchestrator-service.ts`：

```ts
import type { TodoItem } from '../../shared/todo/todo-item'
import type { TodoStatus } from '../../shared/todo/todo-status'
import type { AcpEngine } from '../../shared/acp/acp-session'
import { ACP_ENGINES } from '../../shared/acp/acp-session'
import type { TodoOrchestratorConfig } from '../../shared/todo/todo-orchestrator-config'
import { buildBasePrompt } from '../../shared/todo/todo-base-prompt'
import { sortAutoPilotCandidates } from './todo-orchestrator-candidate-order'

export type OrchestratorDispatchInput = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  autoPilot: { maxTurns: number }
}

export type OrchestratorDeps = {
  listCandidates: () => TodoItem[]
  updateStatus: (id: string, status: TodoStatus) => void
  resolveCwd: (item: TodoItem) => string | null
  dispatch: (input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>
  getConfig: () => TodoOrchestratorConfig
  now?: () => number
}

export class TodoOrchestratorService {
  private readonly deps: OrchestratorDeps
  private timer: ReturnType<typeof setInterval> | null = null
  private evaluating = false
  // Why: slots are counted by in-flight dispatch promises, not task status, so a
  // crash-orphaned in_progress row never occupies a slot (design §2 recovery).
  private readonly liveSessions = new Set<string>()

  constructor(deps: OrchestratorDeps) {
    this.deps = deps
  }

  start(): void {
    if (this.timer) {
      return
    }
    const { tickMs } = this.deps.getConfig()
    this.timer = setInterval(() => {
      void this.tick()
    }, tickMs)
    void this.tick()
  }

  stop(): void {
    if (!this.timer) {
      return
    }
    clearInterval(this.timer)
    this.timer = null
  }

  /** Event-trigger: an eligibility flip or app signal should re-evaluate now. */
  notifyEligible(): void {
    void this.tick()
  }

  async tick(): Promise<void> {
    if (this.evaluating) {
      return
    }
    this.evaluating = true
    try {
      const cfg = this.deps.getConfig()
      if (!cfg.enabled) {
        return
      }
      const slots = cfg.maxConcurrent - this.liveSessions.size
      if (slots <= 0) {
        return
      }
      const candidates = sortAutoPilotCandidates(
        this.deps.listCandidates().filter((c) => !this.liveSessions.has(c.id))
      ).slice(0, slots)
      for (const candidate of candidates) {
        const cwd = this.deps.resolveCwd(candidate)
        if (!cwd) {
          // Not launchable yet (no ready host / no default dir) — retry next tick.
          continue
        }
        this.liveSessions.add(candidate.id)
        this.deps.updateStatus(candidate.id, 'in_progress')
        const engine: AcpEngine = candidate.preferredAgent ?? ACP_ENGINES[0]
        this.deps
          .dispatch({
            taskId: candidate.id,
            engine,
            prompt: buildBasePrompt(candidate),
            cwd,
            autoPilot: { maxTurns: candidate.autoPilotMaxTurns ?? cfg.defaultMaxTurns }
          })
          // Why: autoPilotRunner.run() resolves only at loop-end, so this promise's
          // lifetime == one AutoPilot run. Release the slot on settle and re-evaluate
          // to fill it. On reject the task stays in_progress for a human to inspect.
          .finally(() => {
            this.liveSessions.delete(candidate.id)
            void this.tick()
          })
      }
    } finally {
      this.evaluating = false
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-orchestrator-service.test.ts`
Expected: PASS（全部 8 个用例）。

- [ ] **Step 5: typecheck**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/todos/todo-orchestrator-service.ts src/main/todos/todo-orchestrator-service.test.ts
git commit -m "feat(todo): add TodoOrchestratorService tick loop with slot accounting"
```

---

## Layer E — 装配接线

### Task 9: runtime `getTodoOrchestratorService()` + resolveCwd + dispatch

**Files:**
- Modify: `src/main/runtime/orca-runtime.ts`

- [ ] **Step 1: 加 lazy getter**

在 `orca-runtime.ts` 顶部 import 区加：

```ts
import { TodoOrchestratorService } from '../todos/todo-orchestrator-service'
import { resolveWorkspaceProjectCwd } from '../../shared/todo/workspace-project-cwd'
```

在类里加一个私有字段（与 `_todoRepository` 等相邻）：

```ts
  private _todoOrchestratorService: TodoOrchestratorService | null = null
```

在 `getAcpKernel()` 之后新增方法（`store` 为该类已持有的持久化 store 引用——沿用类内既有访问方式，如 `this.store`）：

```ts
  // Why: assembled in main-process land so the loop runs headless/SSH-friendly,
  // calling executeRouter directly (no renderer round-trip). Config lives in
  // GlobalSettings so a single global switch gates all autonomous pickup.
  getTodoOrchestratorService(): TodoOrchestratorService {
    if (!this._todoOrchestratorService) {
      const repo = this.getTodoRepository()
      const kernel = this.getAcpKernel()
      this._todoOrchestratorService = new TodoOrchestratorService({
        listCandidates: () => repo.listAutoPilotCandidates(),
        updateStatus: (id, status) => {
          repo.updateItem(id, { status })
        },
        resolveCwd: (item) => {
          const project = repo.listProjects().find((p) => p.id === item.projectId)
          const cwd = resolveWorkspaceProjectCwd(
            item.workspaceProjectId,
            this.store.getProjectHostSetups(),
            project?.defaultWorkingDir ?? null
          )
          return cwd.trim().length > 0 ? cwd : null
        },
        dispatch: (input) => kernel.executeRouter.executeEnginePrompt(input),
        getConfig: () => this.store.getSettings().todoOrchestrator
      })
    }
    return this._todoOrchestratorService
  }
```

> 注：若类内访问持久化 store 的字段名不是 `this.store`，用类内实际名称替换（同文件其它方法引用 store 的方式）。

- [ ] **Step 2: typecheck**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/runtime/orca-runtime.ts
git commit -m "feat(todo): assemble TodoOrchestratorService in runtime"
```

---

### Task 10: 启动装配 start/stop

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: 接线**

在 `src/main/index.ts` 装配 `AutomationService` 附近（约 1774 行 `automations = new AutomationService(...)` 之后），加：

```ts
  // Why: the orchestrator polls the todo board and auto-dispatches eligible tasks.
  // Gated by GlobalSettings.todoOrchestrator.enabled (default off), so start()'s
  // immediate tick is a no-op until the user opts in.
  const todoOrchestrator = runtime.getTodoOrchestratorService()
  todoOrchestrator.start()
```

在应用退出/清理处（`automations.stop()` 或等价的 `before-quit` / `will-quit` 收口附近）加 `todoOrchestrator.stop()`。若 `automations` 在此文件是模块级变量，则 `todoOrchestrator` 同样提升为模块级 `let`，在退出 handler 里 `todoOrchestrator?.stop()`。

- [ ] **Step 2: typecheck**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.node.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(todo): start/stop orchestrator with app lifecycle"
```

---

## Layer F — UI + i18n

> UI 数据流沿用现有 todo store slice（`updateTodoItem` 已透传任意 patch 到 `window.api.todos.update`）与 settings store（`updateSettings`）。先确认 IPC/preload 是否需要新增（预期不需要，因为 `updateItem` 已接受完整 patch、`updateSettings` 已接受部分 settings）。

### Task 11: 任务级「AutoPilot eligible」开关

**Files:**
- Modify: 任务详情面板组件（定位见 Step 1）

- [ ] **Step 1: 定位详情面板 + 现有 update 用法**

Run: `grep -rln "updateTodoItem" src/renderer/src/components/todo/detail/`
读出承载任务属性编辑（priority/labels 等）的详情组件，确认它已通过 `useAppStore((s) => s.updateTodoItem)` 写字段。选它作为宿主。

- [ ] **Step 2: 加开关 UI**

在该详情组件的属性区加一个 checkbox + 可选 max turns 数字输入，绑定 `item.autoPilotEnabled` / `item.autoPilotMaxTurns`，onChange 调 `updateTodoItem(item.id, { autoPilotEnabled: e.target.checked })` 与 `updateTodoItem(item.id, { autoPilotMaxTurns: value })`。所有文案走 `translate`：

```tsx
<div className="flex items-center gap-2">
  <input
    id="todo-autopilot-eligible"
    type="checkbox"
    className="size-4"
    checked={item.autoPilotEnabled}
    onChange={(e) => void updateTodoItem(item.id, { autoPilotEnabled: e.target.checked })}
  />
  <Label htmlFor="todo-autopilot-eligible" className="cursor-pointer">
    {translate('auto.components.todo.detail.autoPilotEligible', 'AutoPilot eligible')}
  </Label>
</div>
```

- [ ] **Step 3: typecheck（web）**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.tc.web.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/todo/detail/
git commit -m "feat(todo): add task-level AutoPilot eligible toggle"
```

---

### Task 12: 全局编排设置 UI（启用 + 并发上限）

**Files:**
- Modify: 设置面板组件（定位见 Step 1）

- [ ] **Step 1: 定位设置面板**

Run: `grep -rln "keepComputerAwakeWhileAgentsRun" src/renderer/src/`
找到渲染该开关的设置组件，作为 `todoOrchestrator` 设置项宿主，沿用其 `updateSettings` 写法。

- [ ] **Step 2: 加启用开关 + 并发输入**

绑定 `settings.todoOrchestrator.enabled` 与 `settings.todoOrchestrator.maxConcurrent`，onChange 调 `updateSettings({ todoOrchestrator: { ...settings.todoOrchestrator, enabled } })`。文案走 `translate`：

```tsx
<Label>{translate('auto.settings.todoOrchestrator.enable', 'Autonomous task orchestrator')}</Label>
<Label>{translate('auto.settings.todoOrchestrator.maxConcurrent', 'Max concurrent tasks')}</Label>
```

数字输入 `min={1}`，`Math.max(1, Number(v) || 1)` 规整。

- [ ] **Step 3: typecheck（web）**

Run: `pnpm exec tsc --noEmit -p config/tsconfig.tc.web.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/
git commit -m "feat(todo): add global orchestrator settings UI"
```

---

### Task 13: i18n 五 locale 同步

**Files:**
- Modify: `src/renderer/src/i18n/locales/{en,zh,ja,ko,es}.json`（或项目实际 catalog 结构）

- [ ] **Step 1: 确认 catalog 工作流**

Run: `ls src/renderer/src/i18n/locales/ && cat package.json | grep -i localization`
确认 sync/verify 脚本名。

- [ ] **Step 2: 补齐 key**

为 Task 11/12 新增的 key 在 5 个 locale 补真实翻译（非英文占位）：
- `auto.components.todo.detail.autoPilotEligible`
- `auto.settings.todoOrchestrator.enable`
- `auto.settings.todoOrchestrator.maxConcurrent`
- （若 Task 11 加了 max turns 输入）对应 label key。

zh/ja/ko/es 给出对应语言真实翻译（如 zh：`AutoPilot 自动执行` / `自主任务编排器` / `最大并发任务数`）。

- [ ] **Step 3: 运行本地化校验**

Run: `pnpm run sync:localization-catalog && pnpm run verify:localization-catalog && pnpm run verify:localization-coverage`
Expected: PASS（无缺失 key、无英文残留）。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/
git commit -m "feat(todo): localize orchestrator UI strings across locales"
```

---

## 收尾

- [ ] **全量校验**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **作用域测试汇总**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-database.test.ts src/main/todos/todo-repository.test.ts src/main/todos/todo-orchestrator-candidate-order.test.ts src/main/todos/todo-orchestrator-service.test.ts`
Expected: 全绿。

- [ ] **收束分支**：使用 superpowers:finishing-a-development-branch。

---

## 交付边界（Done 定义）

- TodoItem 两字段落库 + v5 迁移 + row-mapping + repository 透传，含测试（Task 1-3）。
- `TodoOrchestratorService` 全逻辑单测通过：enabled/slots/排序/cwd-null/派发/抛错释放/重入/live 去重（Task 7-8）。
- 服务在 runtime 装配、index.ts start/stop 接线（Task 9-10）。
- 全局配置读写 + 设置 UI 开关/并发输入（Task 6, 12）。
- 任务级 eligible 开关 UI（Task 11）。
- 五 locale 本地化同步（Task 13）。
- `pnpm typecheck` + `pnpm lint` + 作用域测试全绿。

## 明确不做（推迟到后续增量）

#3 退避重试、#4 按状态并发限额、#5 阻塞门禁、#6 停滞检测/重启 resume、#7 WORKFLOW.md 契约、#8 自动审批、#9 每任务 worktree 隔离、#10 外部 tracker 来源。详见设计 spec §8。
