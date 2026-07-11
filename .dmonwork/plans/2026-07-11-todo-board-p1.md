# TODO 任务管理看板 P1 实施计划

> **给 agentic worker 的说明：** 必需的子技能：使用 ddd-subagent-driven-development（推荐）或 ddd-executing-plans 来逐任务实施这份计划。每一步用 checkbox（`- [ ]`）语法做追踪。

**目标：** 在 Orca 中新增本地自管的 TODO 任务管理看板（多项目、9 状态、拖拽、Markdown 详情、SQLite 持久化），不接引擎。

**架构：** 数据模型放 `src/shared/todo/`（主/渲染共享）。主进程用 `node:sqlite`（`SyncDatabase`）建独立库 `todo.db`，仿 `OrchestrationDb` 做版本化迁移，`TodoRepository` 提供纯函数式 DAO。经 IPC(`todos:*`) → preload(`window.api.todos.*`) → 渲染层 zustand slice(`todos`) 全链路暴露。导航仿 Automations：`activeView='todos'` + open/close + 侧栏按钮 + `App.tsx` lazy 渲染。看板用已装的 `@dnd-kit`，详情复用 `MarkdownPreview`。

**技术栈：** Electron + React + TypeScript、zustand、node:sqlite、@dnd-kit、shadcn UI、react-markdown、i18n(`translate`)、Vitest。

**自检方式：** 代码级测试（Vitest，`config/vitest.config.ts`）。

---

## 文件结构

**新增**
- `src/shared/todo/todo-status.ts` — `TodoStatus` 联合类型 + 类型守卫。
- `src/shared/todo/todo-priority.ts` — `TodoPriority` 联合类型 + 类型守卫。
- `src/shared/todo/todo-item.ts` — `TodoItem` 接口 + `CreateTodoItemInput` / `UpdateTodoItemPatch`。
- `src/shared/todo/todo-project.ts` — `TodoProject` 接口 + create/rename 输入类型。
- `src/shared/todo/todo-template.ts` — `TodoTemplate` 接口 + create/update 输入类型。
- `src/shared/todo/order-key.ts` — 列内排序键生成（`orderKeyBetween`）。
- `src/shared/todo/order-key.test.ts` — 排序键单测。
- `src/main/todos/todo-database.ts` — `TodoDatabase`（建表 + 迁移，仿 `OrchestrationDb`）。
- `src/main/todos/todo-database.test.ts` — 建表幂等/迁移单测。
- `src/main/todos/todo-repository.ts` — `TodoRepository` DAO + row↔对象映射。
- `src/main/todos/todo-repository.test.ts` — CRUD/identifier 自增/labels JSON/级联/move 单测。
- `src/main/ipc/todos.ts` — `registerTodoHandlers(repo)`。
- `src/renderer/src/store/slices/todos.ts` — `TodosSlice`（内存缓存 + 乐观写）。
- `src/renderer/src/components/sidebar/SidebarTodoNavButton.tsx` — 侧栏 TODO 按钮。
- `src/renderer/src/components/todo/todo-status-catalog.tsx` — 9 状态元数据。
- `src/renderer/src/components/todo/todo-status-catalog.test.ts` — 可见/终态/顺序断言。
- `src/renderer/src/components/todo/todo-priority-catalog.tsx` — 5 档优先级元数据。
- `src/renderer/src/components/todo/todo-today-filter.ts` — Todo 列"今天"过滤纯函数。
- `src/renderer/src/components/todo/todo-today-filter.test.ts` — 今天/逾期/无排期边界单测。
- `src/renderer/src/components/todo/TodoPage.tsx` — 整页壳。
- `src/renderer/src/components/todo/TodoBoard.tsx` — DndContext 看板容器。
- `src/renderer/src/components/todo/TodoColumn.tsx` — 单状态列。
- `src/renderer/src/components/todo/TodoCard.tsx` — 卡片。
- `src/renderer/src/components/todo/TodoCreateDialog.tsx` — 新建任务弹窗。
- `src/renderer/src/components/todo/TodoDetailDialog.tsx` — 详情弹窗。
- `src/renderer/src/components/todo/TodoStatusMenu.tsx` — 改状态下拉。
- `src/renderer/src/components/todo/todo-template-picker.tsx` — 模版选择/管理。

**修改**
- `src/main/runtime/orca-runtime.ts` — 装配 `TodoDatabase` + `TodoRepository` 单例（懒初始化）。
- `src/main/ipc/register-core-handlers.ts` — 注册 todo handlers。
- `src/preload/index.ts` — 暴露 `window.api.todos.*`。
- `src/preload/api-types.ts` — `todos` 类型块。
- `src/renderer/src/store/types.ts` — `AppState` 加 `& TodosSlice`。
- `src/renderer/src/store/index.ts` — 组合 `createTodosSlice`。
- `src/renderer/src/store/slices/ui.ts` — `activeView` 加 `'todos'` + open/close + `previousViewBeforeTodos`。
- `src/renderer/src/App.tsx` — lazy import + 条件渲染 `TodoPage`。
- `src/renderer/src/components/sidebar/SidebarNav.tsx` — 渲染 `SidebarTodoNavButton`。
- `src/renderer/src/i18n/locales/en.json` + `zh.json` — 文案。

> 任务顺序：先 shared 类型与纯逻辑（可独立单测），再主进程持久化，再 IPC/preload 链路，再渲染 store 与导航，最后 UI 组件与 i18n。前 10 个任务为 TDD 5 步；UI 任务（11+）为组件搭建，测试以"渲染不崩 + 关键交互 payload"为主。

---

## 任务 1：共享类型 — 状态与优先级

**涉及文件：**
- 新建：`src/shared/todo/todo-status.ts`
- 新建：`src/shared/todo/todo-priority.ts`

> 说明：这两个文件是纯类型 + 常量数组 + 类型守卫，没有独立测试值得先写；其正确性由后续 `todo-status-catalog.test.ts`（任务 9）与 repository 测试间接覆盖。因此本任务不走 5 步 TDD，直接实现并用 typecheck 验证。

- [ ] **第 1 步：写 `todo-status.ts`**

```ts
export type TodoStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'rework'
  | 'human_review'
  | 'merging'
  | 'done'
  | 'canceled'
  | 'duplicate'

export const TODO_STATUSES: readonly TodoStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'rework',
  'human_review',
  'merging',
  'done',
  'canceled',
  'duplicate'
]

export const TERMINAL_TODO_STATUSES: readonly TodoStatus[] = ['done', 'canceled', 'duplicate']

export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (TODO_STATUSES as readonly string[]).includes(value)
}

export function isTerminalTodoStatus(status: TodoStatus): boolean {
  return (TERMINAL_TODO_STATUSES as readonly string[]).includes(status)
}
```

- [ ] **第 2 步：写 `todo-priority.ts`**

```ts
export type TodoPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export const TODO_PRIORITIES: readonly TodoPriority[] = ['none', 'low', 'medium', 'high', 'urgent']

export function isTodoPriority(value: unknown): value is TodoPriority {
  return typeof value === 'string' && (TODO_PRIORITIES as readonly string[]).includes(value)
}
```

- [ ] **第 3 步：验证类型编译**

运行：`pnpm run typecheck`
预期：PASS（无新增类型错误）。

- [ ] **第 4 步：提交**

```bash
git add src/shared/todo/todo-status.ts src/shared/todo/todo-priority.ts
git commit -m "feat(todo): add shared status and priority types"
```

---

## 任务 2：共享类型 — 领域实体

**涉及文件：**
- 新建：`src/shared/todo/todo-project.ts`
- 新建：`src/shared/todo/todo-template.ts`
- 新建：`src/shared/todo/todo-item.ts`

> 同任务 1：纯类型文件，无独立测试，直接实现 + typecheck。

- [ ] **第 1 步：写 `todo-project.ts`**

```ts
export interface TodoProject {
  id: string
  name: string
  identifierPrefix: string
  nextSequence: number
  createdAt: string
  updatedAt: string
}

export interface CreateTodoProjectInput {
  name: string
  identifierPrefix: string
}

export interface RenameTodoProjectInput {
  id: string
  name: string
}
```

- [ ] **第 2 步：写 `todo-template.ts`**

```ts
export interface TodoTemplate {
  id: string
  name: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface CreateTodoTemplateInput {
  name: string
  body: string
}

export interface UpdateTodoTemplateInput {
  id: string
  name?: string
  body?: string
}
```

- [ ] **第 3 步：写 `todo-item.ts`**

```ts
import type { TodoStatus } from './todo-status'
import type { TodoPriority } from './todo-priority'

export interface TodoItem {
  id: string
  identifier: string
  projectId: string
  title: string
  description: string
  status: TodoStatus
  priority: TodoPriority
  scheduledDate: string | null
  estimate: number | null
  labels: string[]
  templateId: string | null
  orderKey: string
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface CreateTodoItemInput {
  projectId: string
  title: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  scheduledDate?: string | null
  estimate?: number | null
  labels?: string[]
  templateId?: string | null
}

export interface UpdateTodoItemPatch {
  title?: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  scheduledDate?: string | null
  estimate?: number | null
  labels?: string[]
  templateId?: string | null
}
```

- [ ] **第 4 步：验证类型编译**

运行：`pnpm run typecheck`
预期：PASS。

- [ ] **第 5 步：提交**

```bash
git add src/shared/todo/todo-project.ts src/shared/todo/todo-template.ts src/shared/todo/todo-item.ts
git commit -m "feat(todo): add shared project, template, and item entity types"
```

---

## 任务 3：列内排序键 `order-key.ts`

**涉及文件：**
- 新建：`src/shared/todo/order-key.ts`
- 测试：`src/shared/todo/order-key.test.ts`

> 采用简单的分数索引：在两个 key 之间取"中点"字符串（base-36），实现无需重排的插入。P1 只需保证 `a < mid < b` 字典序成立。

- [ ] **第 1 步：写失败的测试**

```ts
import { describe, expect, it } from 'vitest'
import { FIRST_ORDER_KEY, orderKeyBetween } from './order-key'

describe('orderKeyBetween', () => {
  it('returns a key after the first when appending to an empty column', () => {
    const key = orderKeyBetween(null, null)
    expect(key).toBe(FIRST_ORDER_KEY)
  })

  it('returns a key greater than the previous when appending at the end', () => {
    const key = orderKeyBetween('a0', null)
    expect(key > 'a0').toBe(true)
  })

  it('returns a key smaller than the next when prepending at the start', () => {
    const key = orderKeyBetween(null, 'a0')
    expect(key < 'a0').toBe(true)
  })

  it('returns a key strictly between two adjacent keys', () => {
    const before = 'a0'
    const after = 'a1'
    const mid = orderKeyBetween(before, after)
    expect(mid > before).toBe(true)
    expect(mid < after).toBe(true)
  })

  it('produces stable ascending order for sequential appends', () => {
    let prev: string | null = null
    const keys: string[] = []
    for (let i = 0; i < 5; i++) {
      const key = orderKeyBetween(prev, null)
      keys.push(key)
      prev = key
    }
    const sorted = [...keys].sort()
    expect(keys).toEqual(sorted)
  })
})
```

- [ ] **第 2 步：跑测试，确认它失败**

运行：`pnpm exec vitest run src/shared/todo/order-key.test.ts`
预期：FAIL，报错 "Cannot find module './order-key'" 或 "orderKeyBetween is not a function"。

- [ ] **第 3 步：写最小实现**

```ts
// 分数索引排序键：字符集为 base-36 的 '0'-'9''a'-'z'。
// orderKeyBetween(a, b) 返回一个字典序严格位于 (a, b) 之间的字符串。
// a 为 null 表示"列首之前"，b 为 null 表示"列尾之后"。

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length
const MID_DIGIT = DIGITS[Math.floor(BASE / 2)] // 'i'

export const FIRST_ORDER_KEY = MID_DIGIT

function digitValue(ch: string): number {
  const idx = DIGITS.indexOf(ch)
  return idx < 0 ? 0 : idx
}

export function orderKeyBetween(before: string | null, after: string | null): string {
  if (!before && !after) {
    return FIRST_ORDER_KEY
  }
  if (!before && after) {
    // 需要一个 < after 的 key：在 after 前缀基础上取更小首位，或加深一位。
    return keyBefore(after)
  }
  if (before && !after) {
    // 需要一个 > before 的 key。
    return keyAfter(before)
  }
  return keyMid(before as string, after as string)
}

function keyAfter(before: string): string {
  // 逐位尝试把最后一位往上加；到顶则追加中位字符。
  for (let i = before.length - 1; i >= 0; i--) {
    const v = digitValue(before[i])
    if (v < BASE - 1) {
      return before.slice(0, i) + DIGITS[v + 1]
    }
  }
  return before + MID_DIGIT
}

function keyBefore(after: string): string {
  // 首位若可减则减；否则在前面拼一个更小前缀再加深。
  const v = digitValue(after[0])
  if (v > 0) {
    return DIGITS[v - 1] + MID_DIGIT
  }
  return DIGITS[0] + keyBefore(after.slice(1) || MID_DIGIT)
}

function keyMid(before: string, after: string): string {
  // 找到严格位于 before 与 after 之间的字符串。
  let prefix = ''
  let i = 0
  for (;;) {
    const a = i < before.length ? digitValue(before[i]) : -1
    const b = i < after.length ? digitValue(after[i]) : BASE
    if (a === b) {
      prefix += DIGITS[a]
      i++
      continue
    }
    if (b - a > 1) {
      const mid = a + Math.floor((b - a) / 2)
      return prefix + DIGITS[mid]
    }
    // 相邻两位：固定 before 的这一位，然后在其后接一个 > 剩余部分的 key。
    prefix += DIGITS[a < 0 ? 0 : a]
    const rest = i + 1 < before.length ? before.slice(i + 1) : ''
    return prefix + (rest ? keyAfter(rest) : MID_DIGIT)
  }
}
```

- [ ] **第 4 步：跑测试，确认它通过**

运行：`pnpm exec vitest run src/shared/todo/order-key.test.ts`
预期：PASS（5 个用例全绿）。

- [ ] **第 5 步：提交**

```bash
git add src/shared/todo/order-key.ts src/shared/todo/order-key.test.ts
git commit -m "feat(todo): add fractional order-key generation"
```

---

## 任务 4：SQLite Schema 层 `todo-database.ts`

**涉及文件：**
- 新建：`src/main/todos/todo-database.ts`
- 测试：`src/main/todos/todo-database.test.ts`

> 结构照抄 `src/main/runtime/orchestration/db.ts` 的 `OrchestrationDb`：`SCHEMA_VERSION` 常量 + 构造里 pragma + `createTables()` 幂等建表 + `migrate()` 事务化 + `hasColumn()` 探测。`SyncDatabase` 通过 `import Database from '../sqlite/sync-database'` 引入，构造 `new Database(path)`，支持 `':memory:'`。

- [ ] **第 1 步：写失败的测试**

```ts
import { describe, expect, it } from 'vitest'
import { TodoDatabase } from './todo-database'

function tableNames(db: TodoDatabase): string[] {
  const rows = db.raw
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

describe('TodoDatabase', () => {
  it('creates the three todo tables on first open', () => {
    const db = new TodoDatabase(':memory:')
    const names = tableNames(db)
    expect(names).toContain('todo_projects')
    expect(names).toContain('todo_templates')
    expect(names).toContain('todo_items')
    db.close()
  })

  it('sets user_version to the current schema version', () => {
    const db = new TodoDatabase(':memory:')
    const version = db.raw.pragma('user_version', { simple: true }) as number
    expect(version).toBe(1)
    db.close()
  })

  it('is idempotent — reopening does not throw or duplicate tables', () => {
    const db = new TodoDatabase(':memory:')
    // 再次调用建表不应抛错
    expect(() => db.ensureSchema()).not.toThrow()
    expect(tableNames(db).filter((n) => n === 'todo_items')).toHaveLength(1)
    db.close()
  })

  it('enforces foreign keys (cascade delete wiring is active)', () => {
    const db = new TodoDatabase(':memory:')
    const fk = db.raw.pragma('foreign_keys', { simple: true }) as number
    expect(fk).toBe(1)
    db.close()
  })
})
```

- [ ] **第 2 步：跑测试，确认它失败**

运行：`pnpm exec vitest run src/main/todos/todo-database.test.ts`
预期：FAIL，"Cannot find module './todo-database'"。

- [ ] **第 3 步：写最小实现**

```ts
import Database from '../sqlite/sync-database'

const SCHEMA_VERSION = 1

export class TodoDatabase {
  private db: Database.Database

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('foreign_keys = ON')
    this.ensureSchema()
    this.migrate()
  }

  /** 暴露底层连接给 Repository 与测试使用。 */
  get raw(): Database.Database {
    return this.db
  }

  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todo_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        identifier_prefix TEXT NOT NULL,
        next_sequence INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todo_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS todo_items (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES todo_projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'none',
        scheduled_date TEXT,
        estimate INTEGER,
        labels TEXT NOT NULL DEFAULT '[]',
        template_id TEXT REFERENCES todo_templates(id) ON DELETE SET NULL,
        order_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_todo_items_project_status
        ON todo_items(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_todo_items_scheduled
        ON todo_items(scheduled_date);
    `)
  }

  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number
    if (current >= SCHEMA_VERSION) {
      // 已是最新，仅确保初次写入版本号。
      if (current === 0) {
        this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
      }
      return
    }
    this.db.exec('BEGIN')
    try {
      // P1 仅 v1，无历史迁移。P2/P4 在此按 `if (current < N)` 追加事务化 ALTER。
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  // 预留：P2 加 session_id、P4 加指标列时用于幂等探测。
  hasColumn(table: string, column: string): boolean {
    const rows = this.db.pragma(`table_info(${table})`) as { name: string }[]
    return rows.some((r) => r.name === column)
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **第 4 步：跑测试，确认它通过**

运行：`pnpm exec vitest run src/main/todos/todo-database.test.ts`
预期：PASS（4 个用例全绿）。

- [ ] **第 5 步：提交**

```bash
git add src/main/todos/todo-database.ts src/main/todos/todo-database.test.ts
git commit -m "feat(todo): add SQLite schema layer with versioned migration"
```

---

## 任务 5：访问层 `todo-repository.ts`

**涉及文件：**
- 新建：`src/main/todos/todo-repository.ts`
- 测试：`src/main/todos/todo-repository.test.ts`

> 纯函数式 DAO，持有 `TodoDatabase` 实例，用预处理语句。row↔对象映射（snake_case↔camelCase、labels JSON parse/stringify）集中在 `rowToTodoItem`。ID 用 `randomUUID()`（node:crypto）。时间戳用 ISO 字符串（`new Date().toISOString()`），排期用 `YYYY-MM-DD`。identifier 在同一 SQLite 事务内读 `next_sequence` 生成并 +1。

- [ ] **第 1 步：写失败的测试**

```ts
import { describe, expect, it } from 'vitest'
import { TodoDatabase } from './todo-database'
import { TodoRepository } from './todo-repository'

function makeRepo(): TodoRepository {
  return new TodoRepository(new TodoDatabase(':memory:'))
}

describe('TodoRepository — projects', () => {
  it('creates and lists a project', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'Marketing', identifierPrefix: 'MT' })
    expect(project.id).toBeTruthy()
    expect(project.nextSequence).toBe(1)
    expect(repo.listProjects()).toHaveLength(1)
  })

  it('renames a project', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'Old', identifierPrefix: 'OL' })
    const renamed = repo.renameProject({ id: project.id, name: 'New' })
    expect(renamed.name).toBe('New')
  })

  it('cascade-deletes items when a project is deleted', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'Temp', identifierPrefix: 'TP' })
    repo.createItem({ projectId: project.id, title: 'A' })
    repo.deleteProject(project.id)
    expect(repo.listItems(project.id)).toHaveLength(0)
    expect(repo.listProjects()).toHaveLength(0)
  })
})

describe('TodoRepository — items', () => {
  it('generates sequential identifiers with the project prefix', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'Marketing', identifierPrefix: 'MT' })
    const a = repo.createItem({ projectId: project.id, title: 'First' })
    const b = repo.createItem({ projectId: project.id, title: 'Second' })
    expect(a.identifier).toBe('MT-1')
    expect(b.identifier).toBe('MT-2')
    const reloaded = repo.listProjects().find((p) => p.id === project.id)
    expect(reloaded?.nextSequence).toBe(3)
  })

  it('round-trips labels as a JSON array', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({
      projectId: project.id,
      title: 'Tagged',
      labels: ['bug', 'urgent']
    })
    const fetched = repo.getItem(item.id)
    expect(fetched?.labels).toEqual(['bug', 'urgent'])
  })

  it('defaults status to backlog and priority to none', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({ projectId: project.id, title: 'Default' })
    expect(item.status).toBe('backlog')
    expect(item.priority).toBe('none')
    expect(item.orderKey).toBeTruthy()
  })

  it('updates a patch and sets completedAt when entering a terminal status', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({ projectId: project.id, title: 'Ship' })
    const updated = repo.updateItem(item.id, { status: 'done' })
    expect(updated.status).toBe('done')
    expect(updated.completedAt).not.toBeNull()
  })

  it('clears completedAt when leaving a terminal status', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({ projectId: project.id, title: 'Reopen' })
    repo.updateItem(item.id, { status: 'done' })
    const reopened = repo.updateItem(item.id, { status: 'todo' })
    expect(reopened.completedAt).toBeNull()
  })

  it('moves an item to a new status and order key', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({ projectId: project.id, title: 'Move' })
    const moved = repo.moveItem(item.id, 'in_progress', 'z9')
    expect(moved.status).toBe('in_progress')
    expect(moved.orderKey).toBe('z9')
  })

  it('deletes an item', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({ projectId: project.id, title: 'Bye' })
    repo.deleteItem(item.id)
    expect(repo.getItem(item.id)).toBeNull()
  })
})

describe('TodoRepository — templates', () => {
  it('creates, lists, updates, and deletes a template', () => {
    const repo = makeRepo()
    const tpl = repo.createTemplate({ name: 'Bug', body: '## Steps' })
    expect(repo.listTemplates()).toHaveLength(1)
    const updated = repo.updateTemplate({ id: tpl.id, name: 'Bug Report' })
    expect(updated.name).toBe('Bug Report')
    repo.deleteTemplate(tpl.id)
    expect(repo.listTemplates()).toHaveLength(0)
  })

  it('nulls template_id on items when the template is deleted', () => {
    const repo = makeRepo()
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const tpl = repo.createTemplate({ name: 'T', body: 'x' })
    const item = repo.createItem({ projectId: project.id, title: 'WithTpl', templateId: tpl.id })
    repo.deleteTemplate(tpl.id)
    expect(repo.getItem(item.id)?.templateId).toBeNull()
  })
})
```

- [ ] **第 2 步：跑测试，确认它失败**

运行：`pnpm exec vitest run src/main/todos/todo-repository.test.ts`
预期：FAIL，"Cannot find module './todo-repository'"。

- [ ] **第 3 步：写最小实现**

```ts
import { randomUUID } from 'node:crypto'
import type { TodoDatabase } from './todo-database'
import { isTerminalTodoStatus, type TodoStatus } from '../../shared/todo/todo-status'
import type { TodoPriority } from '../../shared/todo/todo-priority'
import type {
  CreateTodoItemInput,
  TodoItem,
  UpdateTodoItemPatch
} from '../../shared/todo/todo-item'
import type {
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  TodoProject
} from '../../shared/todo/todo-project'
import type {
  CreateTodoTemplateInput,
  TodoTemplate,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'
import { orderKeyBetween } from '../../shared/todo/order-key'

interface ProjectRow {
  id: string
  name: string
  identifier_prefix: string
  next_sequence: number
  created_at: string
  updated_at: string
}

interface TemplateRow {
  id: string
  name: string
  body: string
  created_at: string
  updated_at: string
}

interface ItemRow {
  id: string
  identifier: string
  project_id: string
  title: string
  description: string
  status: string
  priority: string
  scheduled_date: string | null
  estimate: number | null
  labels: string
  template_id: string | null
  order_key: string
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

function rowToProject(row: ProjectRow): TodoProject {
  return {
    id: row.id,
    name: row.name,
    identifierPrefix: row.identifier_prefix,
    nextSequence: row.next_sequence,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToTemplate(row: TemplateRow): TodoTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToTodoItem(row: ItemRow): TodoItem {
  let labels: string[] = []
  try {
    const parsed = JSON.parse(row.labels)
    if (Array.isArray(parsed)) {
      labels = parsed.filter((l): l is string => typeof l === 'string')
    }
  } catch {
    labels = []
  }
  return {
    id: row.id,
    identifier: row.identifier,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status as TodoStatus,
    priority: row.priority as TodoPriority,
    scheduledDate: row.scheduled_date,
    estimate: row.estimate,
    labels,
    templateId: row.template_id,
    orderKey: row.order_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  }
}

export class TodoRepository {
  constructor(private readonly database: TodoDatabase) {}

  private get db() {
    return this.database.raw
  }

  // ---- projects ----
  listProjects(): TodoProject[] {
    const rows = this.db
      .prepare('SELECT * FROM todo_projects ORDER BY created_at ASC')
      .all() as ProjectRow[]
    return rows.map(rowToProject)
  }

  createProject(input: CreateTodoProjectInput): TodoProject {
    const ts = nowIso()
    const row: ProjectRow = {
      id: randomUUID(),
      name: input.name,
      identifier_prefix: input.identifierPrefix,
      next_sequence: 1,
      created_at: ts,
      updated_at: ts
    }
    this.db
      .prepare(
        `INSERT INTO todo_projects (id, name, identifier_prefix, next_sequence, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.name,
        row.identifier_prefix,
        row.next_sequence,
        row.created_at,
        row.updated_at
      )
    return rowToProject(row)
  }

  renameProject(input: RenameTodoProjectInput): TodoProject {
    const ts = nowIso()
    this.db
      .prepare('UPDATE todo_projects SET name = ?, updated_at = ? WHERE id = ?')
      .run(input.name, ts, input.id)
    const row = this.db
      .prepare('SELECT * FROM todo_projects WHERE id = ?')
      .get(input.id) as ProjectRow
    return rowToProject(row)
  }

  deleteProject(id: string): void {
    // ON DELETE CASCADE 会连带删除 todo_items（foreign_keys=ON)。
    this.db.prepare('DELETE FROM todo_projects WHERE id = ?').run(id)
  }

  // ---- items ----
  listItems(projectId: string): TodoItem[] {
    const rows = this.db
      .prepare('SELECT * FROM todo_items WHERE project_id = ? ORDER BY order_key ASC')
      .all(projectId) as ItemRow[]
    return rows.map(rowToTodoItem)
  }

  getItem(id: string): TodoItem | null {
    const row = this.db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as
      | ItemRow
      | undefined
    return row ? rowToTodoItem(row) : null
  }

  createItem(input: CreateTodoItemInput): TodoItem {
    const ts = nowIso()
    const status: TodoStatus = input.status ?? 'backlog'
    // 追加到该 (project, status) 列尾:取当前最大 order_key 之后。
    const lastKey = this.db
      .prepare(
        `SELECT order_key FROM todo_items
         WHERE project_id = ? AND status = ?
         ORDER BY order_key DESC LIMIT 1`
      )
      .get(input.projectId, status) as { order_key: string } | undefined
    const orderKey = orderKeyBetween(lastKey?.order_key ?? null, null)

    let identifier = ''
    this.db.exec('BEGIN')
    try {
      const project = this.db
        .prepare('SELECT identifier_prefix, next_sequence FROM todo_projects WHERE id = ?')
        .get(input.projectId) as { identifier_prefix: string; next_sequence: number } | undefined
      if (!project) {
        throw new Error(`todo project not found: ${input.projectId}`)
      }
      identifier = `${project.identifier_prefix}-${project.next_sequence}`
      this.db
        .prepare('UPDATE todo_projects SET next_sequence = next_sequence + 1, updated_at = ? WHERE id = ?')
        .run(ts, input.projectId)

      const row: ItemRow = {
        id: randomUUID(),
        identifier,
        project_id: input.projectId,
        title: input.title,
        description: input.description ?? '',
        status,
        priority: input.priority ?? 'none',
        scheduled_date: input.scheduledDate ?? null,
        estimate: input.estimate ?? null,
        labels: JSON.stringify(input.labels ?? []),
        template_id: input.templateId ?? null,
        order_key: orderKey,
        created_at: ts,
        updated_at: ts,
        started_at: status === 'in_progress' ? ts : null,
        completed_at: isTerminalTodoStatus(status) ? ts : null
      }
      this.db
        .prepare(
          `INSERT INTO todo_items
           (id, identifier, project_id, title, description, status, priority, scheduled_date,
            estimate, labels, template_id, order_key, created_at, updated_at, started_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          row.id,
          row.identifier,
          row.project_id,
          row.title,
          row.description,
          row.status,
          row.priority,
          row.scheduled_date,
          row.estimate,
          row.labels,
          row.template_id,
          row.order_key,
          row.created_at,
          row.updated_at,
          row.started_at,
          row.completed_at
        )
      this.db.exec('COMMIT')
      return rowToTodoItem(row)
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  updateItem(id: string, patch: UpdateTodoItemPatch): TodoItem {
    const existing = this.getItem(id)
    if (!existing) {
      throw new Error(`todo item not found: ${id}`)
    }
    const ts = nowIso()
    const next: TodoItem = { ...existing, ...stripUndefined(patch), updatedAt: ts }

    if (patch.status !== undefined && patch.status !== existing.status) {
      if (isTerminalTodoStatus(patch.status)) {
        next.completedAt = existing.completedAt ?? ts
      } else {
        next.completedAt = null
      }
      if (patch.status === 'in_progress' && existing.startedAt === null) {
        next.startedAt = ts
      }
    }

    this.db
      .prepare(
        `UPDATE todo_items SET
           title = ?, description = ?, status = ?, priority = ?, scheduled_date = ?,
           estimate = ?, labels = ?, template_id = ?, updated_at = ?, started_at = ?, completed_at = ?
         WHERE id = ?`
      )
      .run(
        next.title,
        next.description,
        next.status,
        next.priority,
        next.scheduledDate,
        next.estimate,
        JSON.stringify(next.labels),
        next.templateId,
        next.updatedAt,
        next.startedAt,
        next.completedAt,
        id
      )
    return next
  }

  moveItem(id: string, status: TodoStatus, orderKey: string): TodoItem {
    return this.updateItem(id, { status }) && this.applyOrderKey(id, status, orderKey)
  }

  private applyOrderKey(id: string, status: TodoStatus, orderKey: string): TodoItem {
    const ts = nowIso()
    this.db
      .prepare('UPDATE todo_items SET status = ?, order_key = ?, updated_at = ? WHERE id = ?')
      .run(status, orderKey, ts, id)
    const item = this.getItem(id)
    if (!item) {
      throw new Error(`todo item not found after move: ${id}`)
    }
    return item
  }

  deleteItem(id: string): void {
    this.db.prepare('DELETE FROM todo_items WHERE id = ?').run(id)
  }

  // ---- templates ----
  listTemplates(): TodoTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM todo_templates ORDER BY created_at ASC')
      .all() as TemplateRow[]
    return rows.map(rowToTemplate)
  }

  createTemplate(input: CreateTodoTemplateInput): TodoTemplate {
    const ts = nowIso()
    const row: TemplateRow = {
      id: randomUUID(),
      name: input.name,
      body: input.body,
      created_at: ts,
      updated_at: ts
    }
    this.db
      .prepare(
        'INSERT INTO todo_templates (id, name, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(row.id, row.name, row.body, row.created_at, row.updated_at)
    return rowToTemplate(row)
  }

  updateTemplate(input: UpdateTodoTemplateInput): TodoTemplate {
    const existing = this.db
      .prepare('SELECT * FROM todo_templates WHERE id = ?')
      .get(input.id) as TemplateRow | undefined
    if (!existing) {
      throw new Error(`todo template not found: ${input.id}`)
    }
    const ts = nowIso()
    const name = input.name ?? existing.name
    const body = input.body ?? existing.body
    this.db
      .prepare('UPDATE todo_templates SET name = ?, body = ?, updated_at = ? WHERE id = ?')
      .run(name, body, ts, input.id)
    return rowToTemplate({ ...existing, name, body, updated_at: ts })
  }

  deleteTemplate(id: string): void {
    // ON DELETE SET NULL 会把引用它的 todo_items.template_id 置空。
    this.db.prepare('DELETE FROM todo_templates WHERE id = ?').run(id)
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) {
      out[key] = obj[key]
    }
  }
  return out
}
```

> 注意：`moveItem` 里 `updateItem(...) && applyOrderKey(...)` 依赖 `updateItem` 返回真值（TodoItem 对象恒为真），最终以 `applyOrderKey` 的结果为准。实现者若觉得别扭，可直接在 `moveItem` 内联一次 UPDATE（status + order_key + 终态时间戳），只要满足测试即可。

- [ ] **第 4 步：跑测试，确认它通过**

运行：`pnpm exec vitest run src/main/todos/todo-repository.test.ts`
预期：PASS（全部用例绿）。

- [ ] **第 5 步：提交**

```bash
git add src/main/todos/todo-repository.ts src/main/todos/todo-repository.test.ts
git commit -m "feat(todo): add repository DAO with identifier sequencing"
```

---

## 任务 6：IPC 层 + 主进程装配

**涉及文件：**
- 新建：`src/main/ipc/todos.ts`
- 修改：`src/main/runtime/orca-runtime.ts`（装配 `TodoDatabase` + `TodoRepository` 懒初始化单例）
- 修改：`src/main/ipc/register-core-handlers.ts`（注册 handlers）

> 无独立单测（IPC 是薄转发层，逻辑已被 repository 测试覆盖）。以 typecheck + 手动冒烟验证。handler 命名对齐 spec §3.6。

- [ ] **第 1 步：写 `src/main/ipc/todos.ts`**

```ts
import { ipcMain } from 'electron'
import type { TodoRepository } from '../todos/todo-repository'
import type { CreateTodoItemInput, UpdateTodoItemPatch } from '../../shared/todo/todo-item'
import type { CreateTodoProjectInput, RenameTodoProjectInput } from '../../shared/todo/todo-project'
import type {
  CreateTodoTemplateInput,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'
import type { TodoStatus } from '../../shared/todo/todo-status'

export function registerTodoHandlers(repo: TodoRepository): void {
  ipcMain.handle('todos:projects:list', () => repo.listProjects())
  ipcMain.handle('todos:projects:create', (_e, input: CreateTodoProjectInput) =>
    repo.createProject(input)
  )
  ipcMain.handle('todos:projects:rename', (_e, input: RenameTodoProjectInput) =>
    repo.renameProject(input)
  )
  ipcMain.handle('todos:projects:delete', (_e, id: string) => {
    repo.deleteProject(id)
  })

  ipcMain.handle('todos:items:list', (_e, projectId: string) => repo.listItems(projectId))
  ipcMain.handle('todos:items:get', (_e, id: string) => repo.getItem(id))
  ipcMain.handle('todos:items:create', (_e, input: CreateTodoItemInput) => repo.createItem(input))
  ipcMain.handle('todos:items:update', (_e, id: string, patch: UpdateTodoItemPatch) =>
    repo.updateItem(id, patch)
  )
  ipcMain.handle('todos:items:delete', (_e, id: string) => {
    repo.deleteItem(id)
  })
  ipcMain.handle(
    'todos:items:move',
    (_e, id: string, status: TodoStatus, orderKey: string) => repo.moveItem(id, status, orderKey)
  )

  ipcMain.handle('todos:templates:list', () => repo.listTemplates())
  ipcMain.handle('todos:templates:create', (_e, input: CreateTodoTemplateInput) =>
    repo.createTemplate(input)
  )
  ipcMain.handle('todos:templates:update', (_e, input: UpdateTodoTemplateInput) =>
    repo.updateTemplate(input)
  )
  ipcMain.handle('todos:templates:delete', (_e, id: string) => {
    repo.deleteTemplate(id)
  })
}
```

- [ ] **第 2 步：在 `orca-runtime.ts` 装配单例**

在文件顶部 import 区（与 `OrchestrationDb` import 相邻，约 L49）加：

```ts
import { TodoDatabase } from '../todos/todo-database'
import { TodoRepository } from '../todos/todo-repository'
```

在私有字段区（`_orchestrationDb` 附近，约 L1937）加：

```ts
private _todoRepository: TodoRepository | null = null
```

在 `getOrchestrationDb()` 方法附近（约 L2564）加一个 getter：

```ts
getTodoRepository(): TodoRepository {
  if (!this._todoRepository) {
    const { app } = require('electron')
    const dbPath = join(app.getPath('userData'), 'todo.db')
    this._todoRepository = new TodoRepository(new TodoDatabase(dbPath))
  }
  return this._todoRepository
}
```

> `join` 已在 `orca-runtime.ts` 从 `node:path` 导入（`getOrchestrationDb` 已在用），无需重复导入。若实际未导入，则补 `import { join } from 'node:path'`。

- [ ] **第 3 步：在 `register-core-handlers.ts` 注册**

顶部 import（与 `registerAutomationHandlers` 相邻，约 L42）加：

```ts
import { registerTodoHandlers } from './todos'
```

在 `registerCoreHandlers(...)` 函数体内（automations 注册之后，约 L147 之后）加：

```ts
registerTodoHandlers(runtime.getTodoRepository())
```

> `runtime` 是 `registerCoreHandlers` 的既有参数（`OrcaRuntime` 实例，automations 也是从它取服务）。确认参数名后照用；若参数名不同，用实际的运行时实例名。

- [ ] **第 4 步：验证类型编译**

运行：`pnpm run typecheck`
预期：PASS。

- [ ] **第 5 步：提交**

```bash
git add src/main/ipc/todos.ts src/main/runtime/orca-runtime.ts src/main/ipc/register-core-handlers.ts
git commit -m "feat(todo): wire IPC handlers and runtime repository singleton"
```

---

## 任务 7：preload 暴露 `window.api.todos`

**涉及文件：**
- 修改：`src/preload/index.ts`（`todos` 命名空间）
- 修改：`src/preload/api-types.ts`（`todos` 类型块）

> 无独立单测，typecheck 验证。类型引用共享的 `TodoItem`/`TodoProject`/`TodoTemplate` 与输入类型。

- [ ] **第 1 步：在 `src/preload/index.ts` 的 api 对象里加 `todos`（与 `automations` 相邻，约 L3932）**

```ts
todos: {
  projects: {
    list: () => ipcRenderer.invoke('todos:projects:list'),
    create: (input) => ipcRenderer.invoke('todos:projects:create', input),
    rename: (input) => ipcRenderer.invoke('todos:projects:rename', input),
    delete: (id) => ipcRenderer.invoke('todos:projects:delete', id)
  },
  items: {
    list: (projectId) => ipcRenderer.invoke('todos:items:list', projectId),
    get: (id) => ipcRenderer.invoke('todos:items:get', id),
    create: (input) => ipcRenderer.invoke('todos:items:create', input),
    update: (id, patch) => ipcRenderer.invoke('todos:items:update', id, patch),
    delete: (id) => ipcRenderer.invoke('todos:items:delete', id),
    move: (id, status, orderKey) =>
      ipcRenderer.invoke('todos:items:move', id, status, orderKey)
  },
  templates: {
    list: () => ipcRenderer.invoke('todos:templates:list'),
    create: (input) => ipcRenderer.invoke('todos:templates:create', input),
    update: (input) => ipcRenderer.invoke('todos:templates:update', input),
    delete: (id) => ipcRenderer.invoke('todos:templates:delete', id)
  }
},
```

- [ ] **第 2 步：在 `src/preload/api-types.ts` 加类型块（与 `automations` 相邻，约 L2854）**

先在文件顶部 import 区补共享类型：

```ts
import type { TodoItem, CreateTodoItemInput, UpdateTodoItemPatch } from '../shared/todo/todo-item'
import type {
  TodoProject,
  CreateTodoProjectInput,
  RenameTodoProjectInput
} from '../shared/todo/todo-project'
import type {
  TodoTemplate,
  CreateTodoTemplateInput,
  UpdateTodoTemplateInput
} from '../shared/todo/todo-template'
import type { TodoStatus } from '../shared/todo/todo-status'
```

在 api 类型接口里加：

```ts
todos: {
  projects: {
    list: () => Promise<TodoProject[]>
    create: (input: CreateTodoProjectInput) => Promise<TodoProject>
    rename: (input: RenameTodoProjectInput) => Promise<TodoProject>
    delete: (id: string) => Promise<void>
  }
  items: {
    list: (projectId: string) => Promise<TodoItem[]>
    get: (id: string) => Promise<TodoItem | null>
    create: (input: CreateTodoItemInput) => Promise<TodoItem>
    update: (id: string, patch: UpdateTodoItemPatch) => Promise<TodoItem>
    delete: (id: string) => Promise<void>
    move: (id: string, status: TodoStatus, orderKey: string) => Promise<TodoItem>
  }
  templates: {
    list: () => Promise<TodoTemplate[]>
    create: (input: CreateTodoTemplateInput) => Promise<TodoTemplate>
    update: (input: UpdateTodoTemplateInput) => Promise<TodoTemplate>
    delete: (id: string) => Promise<void>
  }
}
```

> 确认 `api-types.ts` 的相对路径前缀：若其它 import 用 `../../shared/...` 则据实调整（`src/preload/` 到 `src/shared/` 为 `../shared/`）。

- [ ] **第 3 步：验证类型编译**

运行：`pnpm run typecheck`
预期：PASS（preload 的 `todos` 实现与类型对齐）。

- [ ] **第 4 步：提交**

```bash
git add src/preload/index.ts src/preload/api-types.ts
git commit -m "feat(todo): expose window.api.todos over preload"
```

---

## 任务 8：渲染层 store slice `todos.ts`

**涉及文件：**
- 新建：`src/renderer/src/store/slices/todos.ts`
- 修改：`src/renderer/src/store/types.ts`（`AppState` 加 `& TodosSlice`）
- 修改：`src/renderer/src/store/index.ts`（组合 `createTodosSlice`）

> 内存缓存 + 乐观写：写操作先 `await window.api.todos.*`，成功后同步缓存。仿 `memory.ts` 的 slice 形态。无独立单测（依赖 `window.api`，冒烟由导航测试覆盖），typecheck 验证。

- [ ] **第 1 步：写 `src/renderer/src/store/slices/todos.ts`**

```ts
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { TodoItem, CreateTodoItemInput, UpdateTodoItemPatch } from '../../../../shared/todo/todo-item'
import type { TodoProject, CreateTodoProjectInput } from '../../../../shared/todo/todo-project'
import type { TodoTemplate, CreateTodoTemplateInput, UpdateTodoTemplateInput } from '../../../../shared/todo/todo-template'
import type { TodoStatus } from '../../../../shared/todo/todo-status'

export type TodosSlice = {
  todoProjects: TodoProject[]
  todoActiveProjectId: string | null
  todoItems: TodoItem[]
  todoTemplates: TodoTemplate[]
  todoLoaded: boolean

  loadTodoProjects: () => Promise<void>
  setTodoActiveProject: (projectId: string) => Promise<void>
  createTodoProject: (input: CreateTodoProjectInput) => Promise<TodoProject>
  renameTodoProject: (id: string, name: string) => Promise<void>
  deleteTodoProject: (id: string) => Promise<void>

  loadTodoItems: (projectId: string) => Promise<void>
  createTodoItem: (input: CreateTodoItemInput) => Promise<TodoItem>
  updateTodoItem: (id: string, patch: UpdateTodoItemPatch) => Promise<void>
  deleteTodoItem: (id: string) => Promise<void>
  moveTodoItem: (id: string, status: TodoStatus, orderKey: string) => Promise<void>

  loadTodoTemplates: () => Promise<void>
  createTodoTemplate: (input: CreateTodoTemplateInput) => Promise<TodoTemplate>
  updateTodoTemplate: (input: UpdateTodoTemplateInput) => Promise<void>
  deleteTodoTemplate: (id: string) => Promise<void>
}

export const createTodosSlice: StateCreator<AppState, [], [], TodosSlice> = (set, get) => ({
  todoProjects: [],
  todoActiveProjectId: null,
  todoItems: [],
  todoTemplates: [],
  todoLoaded: false,

  loadTodoProjects: async () => {
    const projects = await window.api.todos.projects.list()
    set({ todoProjects: projects, todoLoaded: true })
    const active = get().todoActiveProjectId
    if (!active && projects.length > 0) {
      await get().setTodoActiveProject(projects[0].id)
    }
  },

  setTodoActiveProject: async (projectId) => {
    set({ todoActiveProjectId: projectId })
    await get().loadTodoItems(projectId)
  },

  createTodoProject: async (input) => {
    const project = await window.api.todos.projects.create(input)
    set((s) => ({ todoProjects: [...s.todoProjects, project] }))
    await get().setTodoActiveProject(project.id)
    return project
  },

  renameTodoProject: async (id, name) => {
    const updated = await window.api.todos.projects.rename({ id, name })
    set((s) => ({ todoProjects: s.todoProjects.map((p) => (p.id === id ? updated : p)) }))
  },

  deleteTodoProject: async (id) => {
    await window.api.todos.projects.delete(id)
    set((s) => {
      const remaining = s.todoProjects.filter((p) => p.id !== id)
      const nextActive = s.todoActiveProjectId === id ? (remaining[0]?.id ?? null) : s.todoActiveProjectId
      return {
        todoProjects: remaining,
        todoActiveProjectId: nextActive,
        todoItems: s.todoActiveProjectId === id ? [] : s.todoItems
      }
    })
    const nextActive = get().todoActiveProjectId
    if (nextActive) {
      await get().loadTodoItems(nextActive)
    }
  },

  loadTodoItems: async (projectId) => {
    const items = await window.api.todos.items.list(projectId)
    set({ todoItems: items })
  },

  createTodoItem: async (input) => {
    const item = await window.api.todos.items.create(input)
    set((s) => (s.todoActiveProjectId === input.projectId ? { todoItems: [...s.todoItems, item] } : {}))
    return item
  },

  updateTodoItem: async (id, patch) => {
    const updated = await window.api.todos.items.update(id, patch)
    set((s) => ({ todoItems: s.todoItems.map((it) => (it.id === id ? updated : it)) }))
  },

  deleteTodoItem: async (id) => {
    await window.api.todos.items.delete(id)
    set((s) => ({ todoItems: s.todoItems.filter((it) => it.id !== id) }))
  },

  moveTodoItem: async (id, status, orderKey) => {
    const moved = await window.api.todos.items.move(id, status, orderKey)
    set((s) => ({ todoItems: s.todoItems.map((it) => (it.id === id ? moved : it)) }))
  },

  loadTodoTemplates: async () => {
    const templates = await window.api.todos.templates.list()
    set({ todoTemplates: templates })
  },

  createTodoTemplate: async (input) => {
    const template = await window.api.todos.templates.create(input)
    set((s) => ({ todoTemplates: [...s.todoTemplates, template] }))
    return template
  },

  updateTodoTemplate: async (input) => {
    const updated = await window.api.todos.templates.update(input)
    set((s) => ({ todoTemplates: s.todoTemplates.map((t) => (t.id === input.id ? updated : t)) }))
  },

  deleteTodoTemplate: async (id) => {
    await window.api.todos.templates.delete(id)
    set((s) => ({ todoTemplates: s.todoTemplates.filter((t) => t.id !== id) }))
  }
})
```

- [ ] **第 2 步：在 `store/types.ts` 挂载**

顶部 import 区加：

```ts
import type { TodosSlice } from './slices/todos'
```

在 `export type AppState = ... &` 链末尾加 `& TodosSlice`。

- [ ] **第 3 步：在 `store/index.ts` 组合**

顶部 import 加：

```ts
import { createTodosSlice } from './slices/todos'
```

在 `create<AppState>()((...a) => ({ ... }))` 的展开列表里加：

```ts
  ...createTodosSlice(...a),
```

- [ ] **第 4 步：验证类型编译**

运行：`pnpm run typecheck`
预期：PASS。

- [ ] **第 5 步：提交**

```bash
git add src/renderer/src/store/slices/todos.ts src/renderer/src/store/types.ts src/renderer/src/store/index.ts
git commit -m "feat(todo): add renderer store slice with optimistic writes"
```

---

## 任务 9：状态/优先级元数据目录 + "今天"过滤（TDD 纯逻辑）

**涉及文件：**
- 新建：`src/renderer/src/components/todo/todo-status-catalog.tsx`
- 测试：`src/renderer/src/components/todo/todo-status-catalog.test.ts`
- 新建：`src/renderer/src/components/todo/todo-priority-catalog.tsx`
- 新建：`src/renderer/src/components/todo/todo-today-filter.ts`
- 测试：`src/renderer/src/components/todo/todo-today-filter.test.ts`

> catalog 的可见/终态/顺序断言 + today-filter 的边界为纯逻辑，先写测试。i18n key 与 icon 是数据，测试只断言结构性属性。

- [ ] **第 1 步：写失败的测试**

`todo-status-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  TODO_STATUS_CATALOG,
  getVisibleTodoStatuses,
  getTodoStatusMeta
} from './todo-status-catalog'
import { TODO_STATUSES } from '../../../../shared/todo/todo-status'

describe('todo-status-catalog', () => {
  it('has an entry for every status', () => {
    for (const status of TODO_STATUSES) {
      expect(getTodoStatusMeta(status)).toBeTruthy()
    }
  })

  it('orders statuses 1..9 matching the status dropdown', () => {
    const orders = TODO_STATUSES.map((s) => getTodoStatusMeta(s).order)
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('marks exactly the five default-visible columns', () => {
    const visible = getVisibleTodoStatuses()
    expect(visible).toEqual(['backlog', 'todo', 'in_progress', 'human_review', 'done'])
  })

  it('marks done, canceled, duplicate as terminal', () => {
    expect(getTodoStatusMeta('done').terminal).toBe(true)
    expect(getTodoStatusMeta('canceled').terminal).toBe(true)
    expect(getTodoStatusMeta('duplicate').terminal).toBe(true)
    expect(getTodoStatusMeta('todo').terminal).toBe(false)
  })

  it('exposes an i18n label key and a color token for each status', () => {
    for (const meta of TODO_STATUS_CATALOG) {
      expect(meta.labelKey.length).toBeGreaterThan(0)
      expect(meta.colorToken.length).toBeGreaterThan(0)
    }
  })
})
```

`todo-today-filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isTodoDueToday } from './todo-today-filter'
import type { TodoItem } from '../../../../shared/todo/todo-item'

function item(overrides: Partial<TodoItem>): TodoItem {
  return {
    id: '1',
    identifier: 'P-1',
    projectId: 'p',
    title: 't',
    description: '',
    status: 'todo',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 'a',
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    ...overrides
  }
}

const TODAY = '2026-07-11'

describe('isTodoDueToday', () => {
  it('includes items with no scheduled date', () => {
    expect(isTodoDueToday(item({ scheduledDate: null }), TODAY)).toBe(true)
  })

  it('includes items scheduled for today', () => {
    expect(isTodoDueToday(item({ scheduledDate: '2026-07-11' }), TODAY)).toBe(true)
  })

  it('includes overdue items', () => {
    expect(isTodoDueToday(item({ scheduledDate: '2026-07-01' }), TODAY)).toBe(true)
  })

  it('excludes items scheduled in the future', () => {
    expect(isTodoDueToday(item({ scheduledDate: '2026-07-20' }), TODAY)).toBe(false)
  })
})
```

- [ ] **第 2 步：跑测试，确认它失败**

运行：`pnpm exec vitest run src/renderer/src/components/todo/todo-status-catalog.test.ts src/renderer/src/components/todo/todo-today-filter.test.ts`
预期：FAIL，模块不存在。

- [ ] **第 3 步：写实现**

`todo-status-catalog.tsx`:

```tsx
import {
  Circle,
  CircleDashed,
  CircleDot,
  RefreshCw,
  Eye,
  GitMerge,
  CheckCircle2,
  XCircle,
  Copy,
  type LucideIcon
} from 'lucide-react'
import type { TodoStatus } from '../../../../shared/todo/todo-status'

export interface TodoStatusMeta {
  id: TodoStatus
  labelKey: string
  fallbackLabel: string
  colorToken: string
  icon: LucideIcon
  defaultVisibleColumn: boolean
  terminal: boolean
  order: number
}

export const TODO_STATUS_CATALOG: readonly TodoStatusMeta[] = [
  { id: 'backlog', labelKey: 'auto.components.todo.status.backlog', fallbackLabel: 'Backlog', colorToken: 'text-muted-foreground', icon: CircleDashed, defaultVisibleColumn: true, terminal: false, order: 1 },
  { id: 'todo', labelKey: 'auto.components.todo.status.todo', fallbackLabel: 'Todo', colorToken: 'text-foreground', icon: Circle, defaultVisibleColumn: true, terminal: false, order: 2 },
  { id: 'in_progress', labelKey: 'auto.components.todo.status.in_progress', fallbackLabel: 'In Progress', colorToken: 'text-amber-500', icon: CircleDot, defaultVisibleColumn: true, terminal: false, order: 3 },
  { id: 'rework', labelKey: 'auto.components.todo.status.rework', fallbackLabel: 'Rework', colorToken: 'text-orange-500', icon: RefreshCw, defaultVisibleColumn: false, terminal: false, order: 4 },
  { id: 'human_review', labelKey: 'auto.components.todo.status.human_review', fallbackLabel: 'Human Review', colorToken: 'text-violet-500', icon: Eye, defaultVisibleColumn: true, terminal: false, order: 5 },
  { id: 'merging', labelKey: 'auto.components.todo.status.merging', fallbackLabel: 'Merging', colorToken: 'text-blue-500', icon: GitMerge, defaultVisibleColumn: false, terminal: false, order: 6 },
  { id: 'done', labelKey: 'auto.components.todo.status.done', fallbackLabel: 'Done', colorToken: 'text-emerald-500', icon: CheckCircle2, defaultVisibleColumn: true, terminal: true, order: 7 },
  { id: 'canceled', labelKey: 'auto.components.todo.status.canceled', fallbackLabel: 'Canceled', colorToken: 'text-muted-foreground', icon: XCircle, defaultVisibleColumn: false, terminal: true, order: 8 },
  { id: 'duplicate', labelKey: 'auto.components.todo.status.duplicate', fallbackLabel: 'Duplicate', colorToken: 'text-muted-foreground', icon: Copy, defaultVisibleColumn: false, terminal: true, order: 9 }
]

const STATUS_META_MAP = new Map<TodoStatus, TodoStatusMeta>(
  TODO_STATUS_CATALOG.map((m) => [m.id, m])
)

export function getTodoStatusMeta(status: TodoStatus): TodoStatusMeta {
  const meta = STATUS_META_MAP.get(status)
  if (!meta) {
    throw new Error(`unknown todo status: ${status}`)
  }
  return meta
}

export function getVisibleTodoStatuses(): TodoStatus[] {
  return TODO_STATUS_CATALOG.filter((m) => m.defaultVisibleColumn).map((m) => m.id)
}
```

`todo-priority-catalog.tsx`:

```tsx
import { Minus, SignalLow, SignalMedium, SignalHigh, AlertCircle, type LucideIcon } from 'lucide-react'
import type { TodoPriority } from '../../../../shared/todo/todo-priority'

export interface TodoPriorityMeta {
  id: TodoPriority
  labelKey: string
  fallbackLabel: string
  colorToken: string
  icon: LucideIcon
}

export const TODO_PRIORITY_CATALOG: readonly TodoPriorityMeta[] = [
  { id: 'none', labelKey: 'auto.components.todo.priority.none', fallbackLabel: 'No priority', colorToken: 'text-muted-foreground', icon: Minus },
  { id: 'low', labelKey: 'auto.components.todo.priority.low', fallbackLabel: 'Low', colorToken: 'text-sky-500', icon: SignalLow },
  { id: 'medium', labelKey: 'auto.components.todo.priority.medium', fallbackLabel: 'Medium', colorToken: 'text-amber-500', icon: SignalMedium },
  { id: 'high', labelKey: 'auto.components.todo.priority.high', fallbackLabel: 'High', colorToken: 'text-orange-500', icon: SignalHigh },
  { id: 'urgent', labelKey: 'auto.components.todo.priority.urgent', fallbackLabel: 'Urgent', colorToken: 'text-red-500', icon: AlertCircle }
]

const PRIORITY_META_MAP = new Map<TodoPriority, TodoPriorityMeta>(
  TODO_PRIORITY_CATALOG.map((m) => [m.id, m])
)

export function getTodoPriorityMeta(priority: TodoPriority): TodoPriorityMeta {
  const meta = PRIORITY_META_MAP.get(priority)
  if (!meta) {
    throw new Error(`unknown todo priority: ${priority}`)
  }
  return meta
}
```

`todo-today-filter.ts`:

```ts
import type { TodoItem } from '../../../../shared/todo/todo-item'

/** 返回本地时区当天日期，格式 YYYY-MM-DD。 */
export function localTodayIso(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Todo 列"今天"语义:无排期、排期为今天、或已逾期(排期 < 今天)都纳入。
 * 未来排期(> 今天)排除。日期为纯字典序比较(ISO YYYY-MM-DD 可直接比较)。
 */
export function isTodoDueToday(item: TodoItem, today: string = localTodayIso()): boolean {
  if (item.scheduledDate === null) {
    return true
  }
  return item.scheduledDate <= today
}
```

- [ ] **第 4 步：跑测试，确认它通过**

运行：`pnpm exec vitest run src/renderer/src/components/todo/todo-status-catalog.test.ts src/renderer/src/components/todo/todo-today-filter.test.ts`
预期：PASS。

> 若 lucide icon 名（如 `SignalLow`）在当前 lucide-react 版本不存在，用 `pnpm exec ... ` typecheck 报错定位后换同义图标（如 `BarChart` 系列）。图标仅为展示，不影响测试。

- [ ] **第 5 步：提交**

```bash
git add src/renderer/src/components/todo/todo-status-catalog.tsx src/renderer/src/components/todo/todo-status-catalog.test.ts src/renderer/src/components/todo/todo-priority-catalog.tsx src/renderer/src/components/todo/todo-today-filter.ts src/renderer/src/components/todo/todo-today-filter.test.ts
git commit -m "feat(todo): add status/priority catalogs and today filter"
```

---

## 任务 10：导航状态机 `ui.ts`

**涉及文件：**
- 修改：`src/renderer/src/store/slices/ui.ts`

> 仿 `openAutomationsPage/closeAutomationsPage`。改 4 处:①`activeView` 联合类型加 `'todos'`;②`previousViewBeforeTodos` 字段类型声明;③方法类型声明 `openTodosPage/closeTodosPage`;④实现 + 默认值。无独立单测(导航冒烟见任务 11)，typecheck 验证。

- [ ] **第 1 步:`activeView` 联合类型加 `'todos'`（约 L547-555）**

在联合成员中加一行 `| 'todos'`（与 `'automations'` 相邻）。

- [ ] **第 2 步:加 `previousViewBeforeTodos` 状态字段类型（与 `previousViewBeforeAutomations` 相邻）**

在 slice 类型定义里加：

```ts
previousViewBeforeTodos: AppActiveView
```

> `AppActiveView` 是 `activeView` 的类型别名;若源码用的是内联联合，则照 `previousViewBeforeAutomations` 的实际类型写法照抄。

- [ ] **第 3 步:加方法类型声明（与 `openAutomationsPage` 相邻，约 L684-685）**

```ts
openTodosPage: () => void
closeTodosPage: () => void
```

- [ ] **第 4 步:加默认值 + 方法实现**

默认值区（约 L1132-1138，与其它 `previousViewBefore*: 'terminal'` 相邻）：

```ts
previousViewBeforeTodos: 'terminal',
```

方法实现（与 `openAutomationsPage` 实现相邻）：

```ts
openTodosPage: () => {
  get().recordViewVisit('todos')
  set((state) => ({
    activeView: 'todos',
    previousViewBeforeTodos:
      state.activeView === 'todos' ? state.previousViewBeforeTodos : state.activeView
  }))
},
closeTodosPage: () =>
  set((state) => ({ activeView: state.previousViewBeforeTodos })),
```

> `recordViewVisit` 是既有方法（automations 也调用）。若 `recordViewVisit` 对未知 view 有类型约束，确认它接受新加的 `'todos'`（因 `activeView` 已含 `'todos'`，通常自动覆盖）。

- [ ] **第 5 步:验证类型编译**

运行：`pnpm run typecheck`
预期：PASS（switch 穷尽性检查若涉及 `activeView`，可能要求在别处补 `'todos'` 分支——见任务 11）。

- [ ] **第 6 步:提交**

```bash
git add src/renderer/src/store/slices/ui.ts
git commit -m "feat(todo): add todos view to navigation state machine"
```

---

## 任务 11：整页接入 `App.tsx` + 侧栏按钮

**涉及文件：**
- 新建：`src/renderer/src/components/sidebar/SidebarTodoNavButton.tsx`
- 修改：`src/renderer/src/components/sidebar/SidebarNav.tsx`
- 修改：`src/renderer/src/App.tsx`

> 侧栏按钮仿 `SidebarTaskNavButton.tsx`（去掉 provider 快捷图标等无关逻辑）。`App.tsx` lazy import + 条件渲染,外层沿用 `RecoverableRenderErrorBoundary` + `<Suspense>`。

- [ ] **第 1 步:写 `SidebarTodoNavButton.tsx`**

```tsx
import React from 'react'
import { ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function SidebarTodoNavButton(): React.JSX.Element {
  const openTodosPage = useAppStore((s) => s.openTodosPage)
  const activeView = useAppStore((s) => s.activeView)
  const todosActive = activeView === 'todos'

  return (
    <button
      type="button"
      onClick={() => openTodosPage()}
      aria-current={todosActive ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        todosActive
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <ListTodo
        className={cn('size-4 shrink-0', !todosActive && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={todosActive ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.SidebarTodoNavButton.title', 'TODO')}
      </span>
    </button>
  )
}
```

- [ ] **第 2 步:在 `SidebarNav.tsx` 渲染（约 L65,`<SidebarTaskNavButton />` 附近）**

顶部 import（约 L12）：

```tsx
import { SidebarTodoNavButton } from './SidebarTodoNavButton'
```

在 `<SidebarTaskNavButton />` 之后加：

```tsx
<SidebarTodoNavButton />
```

- [ ] **第 3 步:在 `App.tsx` lazy import + 条件渲染**

lazy import 区（约 L280-285，其它 `lazy(() => import(...))` 附近）：

```tsx
const TodoPage = lazy(() => import('./components/todo/TodoPage'))
```

主区域条件渲染（约 L2299-2305，`activeView === 'automations'` 分支附近）：

```tsx
{activeView === 'todos' ? (
  <RecoverableRenderErrorBoundary boundaryId="page.todos">
    <Suspense fallback={null}>
      <TodoPage />
    </Suspense>
  </RecoverableRenderErrorBoundary>
) : null}
```

> `RecoverableRenderErrorBoundary`、`Suspense`、`lazy` 均为 App.tsx 已导入的符号。照 automations 分支的实际 JSX 结构对齐（fallback、boundaryId 命名风格）。若 App.tsx 用 switch 渲染 view,则在 switch 加 `case 'todos':` 分支。

- [ ] **第 4 步:导航冒烟测试**

新建 `src/renderer/src/components/todo/todo-navigation.test.tsx`（参考 `app-startup-routing.test.ts` 风格,仅验证 store 切换到 `'todos'` 不抛错;若 App 完整渲染依赖过多,退化为对 store action 的断言）：

```tsx
import { describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'

describe('todos navigation', () => {
  it('openTodosPage sets activeView to todos and remembers the previous view', () => {
    const store = useAppStore.getState()
    store.setActiveView('terminal')
    store.openTodosPage()
    expect(useAppStore.getState().activeView).toBe('todos')
    useAppStore.getState().closeTodosPage()
    expect(useAppStore.getState().activeView).toBe('terminal')
  })
})
```

运行：`pnpm exec vitest run src/renderer/src/components/todo/todo-navigation.test.tsx`
预期：PASS。

> 若测试环境无 `window.api`,该测试只碰 ui slice,不触发 `window.api.todos.*`,应可运行。若 store 初始化因其它 slice 依赖 `window` 而报错,参考 `app-startup-routing.test.ts` 的既有 mock/setup。

- [ ] **第 5 步:提交**

```bash
git add src/renderer/src/components/sidebar/SidebarTodoNavButton.tsx src/renderer/src/components/sidebar/SidebarNav.tsx src/renderer/src/App.tsx src/renderer/src/components/todo/todo-navigation.test.tsx
git commit -m "feat(todo): mount TodoPage view and sidebar entry"
```

---

## 任务 12：看板组件（Page / Board / Column / Card）

**涉及文件：**
- 新建：`src/renderer/src/components/todo/TodoPage.tsx`
- 新建：`src/renderer/src/components/todo/TodoBoard.tsx`
- 新建：`src/renderer/src/components/todo/TodoColumn.tsx`
- 新建：`src/renderer/src/components/todo/TodoCard.tsx`

> UI 组件,遵循 `docs/STYLEGUIDE.md` 与 shadcn 基元。拖拽用 `@dnd-kit/core` + `@dnd-kit/sortable`。测试以"渲染不崩 + 列数正确"为主。`TodoPage` 是 `App.tsx` lazy import 的目标,必须 `export default`。

- [ ] **第 1 步:写 `TodoBoard` 列渲染测试**

`src/renderer/src/components/todo/TodoBoard.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoBoard } from './TodoBoard'
import type { TodoItem } from '../../../../shared/todo/todo-item'

function mkItem(id: string, status: TodoItem['status']): TodoItem {
  return {
    id, identifier: `P-${id}`, projectId: 'p', title: `Item ${id}`, description: '',
    status, priority: 'none', scheduledDate: null, estimate: null, labels: [],
    templateId: null, orderKey: id, createdAt: '', updatedAt: '', startedAt: null, completedAt: null
  }
}

describe('TodoBoard', () => {
  it('renders the five default-visible columns', () => {
    render(<TodoBoard items={[mkItem('1', 'todo')]} onMove={() => {}} onOpenItem={() => {}} />)
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Todo')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Human Review')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders a card in its status column', () => {
    render(<TodoBoard items={[mkItem('9', 'todo')]} onMove={() => {}} onOpenItem={() => {}} />)
    expect(screen.getByText('Item 9')).toBeInTheDocument()
  })
})
```

> 若测试环境缺 `@testing-library/react`/`jsdom`,确认 `config/vitest.config.ts` 的 environment 为 `jsdom`(既有组件测试已依赖)。`translate` 的 fallback 会显示英文,故断言英文文案。

- [ ] **第 2 步:跑测试,确认它失败**

运行:`pnpm exec vitest run src/renderer/src/components/todo/TodoBoard.test.tsx`
预期:FAIL,模块不存在。

- [ ] **第 3 步:写实现**

`TodoCard.tsx`:

```tsx
import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import { getTodoStatusMeta } from './todo-status-catalog'
import { getTodoPriorityMeta } from './todo-priority-catalog'

export function TodoCard({
  item,
  onOpen
}: {
  item: TodoItem
  onOpen: (id: string) => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  })
  const statusMeta = getTodoStatusMeta(item.status)
  const priorityMeta = getTodoPriorityMeta(item.priority)
  const StatusIcon = statusMeta.icon
  const PriorityIcon = priorityMeta.icon

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.id)}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-ring',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusIcon className={cn('size-3.5', statusMeta.colorToken)} />
        <span>{item.identifier}</span>
      </div>
      <span className="text-[13px] font-medium leading-snug">{item.title}</span>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityIcon className={cn('size-3.5', priorityMeta.colorToken)} />
        {item.scheduledDate ? <span>{item.scheduledDate}</span> : null}
        {item.labels.length > 0 ? <span>#{item.labels[0]}</span> : null}
      </div>
    </button>
  )
}
```

`TodoColumn.tsx`:

```tsx
import React from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import type { TodoStatusMeta } from './todo-status-catalog'
import { TodoCard } from './TodoCard'

export function TodoColumn({
  meta,
  items,
  onOpenItem
}: {
  meta: TodoStatusMeta
  items: TodoItem[]
  onOpenItem: (id: string) => void
}): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: `column:${meta.id}` })
  const Icon = meta.icon
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 text-[13px] font-medium">
        <Icon className={cn('size-4', meta.colorToken)} />
        <span>{translate(meta.labelKey, meta.fallbackLabel)}</span>
        <span className="text-muted-foreground">{items.length}</span>
      </div>
      <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <TodoCard key={item.id} item={item} onOpen={onOpenItem} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}
```

`TodoBoard.tsx`:

```tsx
import React from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TODO_STATUS_CATALOG, getVisibleTodoStatuses } from './todo-status-catalog'
import { orderKeyBetween } from '../../../../shared/todo/order-key'
import { TodoColumn } from './TodoColumn'

export function TodoBoard({
  items,
  onMove,
  onOpenItem
}: {
  items: TodoItem[]
  onMove: (id: string, status: TodoStatus, orderKey: string) => void
  onOpenItem: (id: string) => void
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const visible = getVisibleTodoStatuses()

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over) {
      return
    }
    const activeId = String(active.id)
    const overId = String(over.id)
    const target = resolveDropTarget(overId, items, visible)
    if (!target) {
      return
    }
    const columnItems = items
      .filter((i) => i.status === target.status && i.id !== activeId)
      .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))
    const index = target.beforeId
      ? columnItems.findIndex((i) => i.id === target.beforeId)
      : columnItems.length
    const prev = index > 0 ? columnItems[index - 1]?.orderKey ?? null : null
    const next = index >= 0 && index < columnItems.length ? columnItems[index]?.orderKey ?? null : null
    const orderKey = orderKeyBetween(prev, next)
    onMove(activeId, target.status, orderKey)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {TODO_STATUS_CATALOG.filter((m) => visible.includes(m.id)).map((meta) => (
          <TodoColumn
            key={meta.id}
            meta={meta}
            items={items
              .filter((i) => i.status === meta.id)
              .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))}
            onOpenItem={onOpenItem}
          />
        ))}
      </div>
    </DndContext>
  )
}

function resolveDropTarget(
  overId: string,
  items: TodoItem[],
  visible: TodoStatus[]
): { status: TodoStatus; beforeId: string | null } | null {
  if (overId.startsWith('column:')) {
    const status = overId.slice('column:'.length) as TodoStatus
    return visible.includes(status) ? { status, beforeId: null } : null
  }
  const overItem = items.find((i) => i.id === overId)
  if (!overItem) {
    return null
  }
  return { status: overItem.status, beforeId: overItem.id }
}
```

`TodoPage.tsx`:

```tsx
import React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { TodoBoard } from './TodoBoard'
import { TodoCreateDialog } from './TodoCreateDialog'
import { TodoDetailDialog } from './TodoDetailDialog'
import { TodoProjectSwitcher } from './TodoProjectSwitcher'

export default function TodoPage(): React.JSX.Element {
  const loadTodoProjects = useAppStore((s) => s.loadTodoProjects)
  const loadTodoTemplates = useAppStore((s) => s.loadTodoTemplates)
  const activeProjectId = useAppStore((s) => s.todoActiveProjectId)
  const items = useAppStore((s) => s.todoItems)
  const moveTodoItem = useAppStore((s) => s.moveTodoItem)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  React.useEffect(() => {
    void loadTodoProjects()
    void loadTodoTemplates()
  }, [loadTodoProjects, loadTodoTemplates])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <TodoProjectSwitcher />
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={!activeProjectId}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          {translate('auto.components.todo.TodoPage.newTask', 'New task')}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeProjectId ? (
          <TodoBoard
            items={items}
            onMove={(id, status, orderKey) => void moveTodoItem(id, status, orderKey)}
            onOpenItem={(id) => setDetailId(id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {translate('auto.components.todo.TodoPage.empty', 'Create a project to get started')}
          </div>
        )}
      </div>
      {createOpen && activeProjectId ? (
        <TodoCreateDialog
          projectId={activeProjectId}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {detailId ? (
        <TodoDetailDialog itemId={detailId} onClose={() => setDetailId(null)} />
      ) : null}
    </div>
  )
}
```

> 依赖两个尚未建的组件:`TodoProjectSwitcher`(项目切换 + 新建/删除,用 shadcn `DropdownMenu` + 二次确认删除)和任务 13 的对话框。实现者建 `TodoProjectSwitcher.tsx`:下拉列出 `todoProjects`,选中调 `setTodoActiveProject`,底部"新建项目"输入 name+prefix 调 `createTodoProject`,删除走确认弹窗调 `deleteTodoProject`。若想减小范围,P1 可先用简单 `<select>` + 内联"+"按钮,但仍需覆盖多项目切换与删除确认(spec §6)。

- [ ] **第 4 步:跑测试,确认它通过**

运行:`pnpm exec vitest run src/renderer/src/components/todo/TodoBoard.test.tsx`
预期:PASS。

- [ ] **第 5 步:提交**

```bash
git add src/renderer/src/components/todo/TodoPage.tsx src/renderer/src/components/todo/TodoBoard.tsx src/renderer/src/components/todo/TodoColumn.tsx src/renderer/src/components/todo/TodoCard.tsx src/renderer/src/components/todo/TodoBoard.test.tsx src/renderer/src/components/todo/TodoProjectSwitcher.tsx
git commit -m "feat(todo): add kanban board, columns, cards, and project switcher"
```

---

## 任务 13：对话框（Create / Detail / StatusMenu / TemplatePicker）

**涉及文件：**
- 新建：`src/renderer/src/components/todo/TodoStatusMenu.tsx`
- 新建：`src/renderer/src/components/todo/todo-template-picker.tsx`
- 新建：`src/renderer/src/components/todo/TodoCreateDialog.tsx`
- 新建：`src/renderer/src/components/todo/TodoDetailDialog.tsx`

> 用 shadcn `Dialog` / `DropdownMenu` / `Select`。详情左侧复用 `editor/MarkdownPreview.tsx`。测试聚焦 `TodoCreateDialog` 提交产出正确 payload 与 `TodoStatusMenu` 的 9 项。

- [ ] **第 1 步:写 `TodoStatusMenu` + `TodoCreateDialog` 测试**

`TodoStatusMenu.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodoStatusMenu } from './TodoStatusMenu'

describe('TodoStatusMenu', () => {
  it('renders all nine statuses in order', () => {
    render(<TodoStatusMenu value="backlog" onChange={() => {}} />)
    const labels = ['Backlog', 'Todo', 'In Progress', 'Rework', 'Human Review', 'Merging', 'Done', 'Canceled', 'Duplicate']
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
```

> `TodoStatusMenu` 为便于测试,默认渲染为始终可见的选项列表(非 portal 弹层),或测试中直接渲染其内部 `TodoStatusMenuContent`。实现者按所选 shadcn 组件调整:若用 `DropdownMenu`(portal),测试需先点击 trigger;为降低脆弱度,建议把 9 项列表抽成可直接渲染的 `TodoStatusOptionList` 组件并对它做断言。

`TodoCreateDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { buildCreateTodoPayload } from './TodoCreateDialog'

describe('buildCreateTodoPayload', () => {
  it('produces a payload with trimmed title and selected fields', () => {
    const payload = buildCreateTodoPayload({
      projectId: 'p1',
      title: '  Ship it  ',
      description: 'body',
      status: 'todo',
      priority: 'high',
      scheduledDate: '2026-07-11',
      estimate: 3,
      labels: ['ux'],
      templateId: 't1'
    })
    expect(payload).toEqual({
      projectId: 'p1',
      title: 'Ship it',
      description: 'body',
      status: 'todo',
      priority: 'high',
      scheduledDate: '2026-07-11',
      estimate: 3,
      labels: ['ux'],
      templateId: 't1'
    })
  })

  it('omits empty optional fields', () => {
    const payload = buildCreateTodoPayload({ projectId: 'p1', title: 'Bare' })
    expect(payload.projectId).toBe('p1')
    expect(payload.title).toBe('Bare')
    expect(payload.scheduledDate ?? null).toBeNull()
  })
})
```

- [ ] **第 2 步:跑测试,确认它失败**

运行:`pnpm exec vitest run src/renderer/src/components/todo/TodoStatusMenu.test.tsx src/renderer/src/components/todo/TodoCreateDialog.test.tsx`
预期:FAIL,模块不存在。

- [ ] **第 3 步:写实现（要点,完整代码由实现者按 shadcn 基元补齐）**

`TodoStatusMenu.tsx` — 导出一个 `TodoStatusOptionList`(遍历 `TODO_STATUS_CATALOG`,每项显示 `order`. icon + label,点击回调 `onChange(status)`)并被 `TodoStatusMenu`(可选包一层 `DropdownMenu`)复用:

```tsx
import React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TODO_STATUS_CATALOG } from './todo-status-catalog'

export function TodoStatusOptionList({
  value,
  onChange
}: {
  value: TodoStatus
  onChange: (status: TodoStatus) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col">
      {TODO_STATUS_CATALOG.map((meta) => {
        const Icon = meta.icon
        return (
          <button
            key={meta.id}
            type="button"
            onClick={() => onChange(meta.id)}
            className={cn(
              'flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent',
              value === meta.id && 'bg-accent'
            )}
          >
            <span className="w-4 text-xs text-muted-foreground">{meta.order}</span>
            <Icon className={cn('size-4', meta.colorToken)} />
            <span>{translate(meta.labelKey, meta.fallbackLabel)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TodoStatusMenu({
  value,
  onChange
}: {
  value: TodoStatus
  onChange: (status: TodoStatus) => void
}): React.JSX.Element {
  return <TodoStatusOptionList value={value} onChange={onChange} />
}
```

`TodoCreateDialog.tsx` — 导出纯函数 `buildCreateTodoPayload`(供单测)+ Dialog 组件:

```tsx
import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { CreateTodoItemInput } from '../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import type { TodoPriority } from '../../../../shared/todo/todo-priority'
import { TodoTemplatePicker } from './todo-template-picker'

export interface CreateTodoFormValues {
  projectId: string
  title: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  scheduledDate?: string | null
  estimate?: number | null
  labels?: string[]
  templateId?: string | null
}

export function buildCreateTodoPayload(values: CreateTodoFormValues): CreateTodoItemInput {
  const payload: CreateTodoItemInput = {
    projectId: values.projectId,
    title: values.title.trim()
  }
  if (values.description) payload.description = values.description
  if (values.status) payload.status = values.status
  if (values.priority) payload.priority = values.priority
  if (values.scheduledDate) payload.scheduledDate = values.scheduledDate
  if (values.estimate != null) payload.estimate = values.estimate
  if (values.labels && values.labels.length > 0) payload.labels = values.labels
  if (values.templateId) payload.templateId = values.templateId
  return payload
}

export function TodoCreateDialog({
  projectId,
  onClose
}: {
  projectId: string
  onClose: () => void
}): React.JSX.Element {
  const createTodoItem = useAppStore((s) => s.createTodoItem)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [templateId, setTemplateId] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<TodoStatus>('backlog')
  const [priority, setPriority] = React.useState<TodoPriority>('none')
  const [scheduledDate, setScheduledDate] = React.useState<string>('')

  const submit = async (): Promise<void> => {
    if (!title.trim()) return
    await createTodoItem(
      buildCreateTodoPayload({
        projectId,
        title,
        description,
        status,
        priority,
        scheduledDate: scheduledDate || null,
        templateId
      })
    )
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('auto.components.todo.TodoCreateDialog.title', 'New task')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            placeholder={translate('auto.components.todo.TodoCreateDialog.titlePlaceholder', 'Task title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TodoTemplatePicker
            value={templateId}
            onSelect={(tpl) => {
              setTemplateId(tpl?.id ?? null)
              if (tpl) setDescription(tpl.body)
            }}
          />
          <Textarea
            placeholder={translate('auto.components.todo.TodoCreateDialog.descPlaceholder', 'Description (Markdown)')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
          />
          <div className="flex items-center gap-2">
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {translate('auto.components.todo.TodoCreateDialog.cancel', 'Cancel')}
          </Button>
          <Button disabled={!title.trim()} onClick={() => void submit()}>
            {translate('auto.components.todo.TodoCreateDialog.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

> 状态/优先级选择器可用 shadcn `Select` 或复用 `TodoStatusOptionList`;为不撑爆本文件,实现者按需接入(spec §5 要求新建含状态/优先级/排期/标签/预估快选,但 P1 最小可用是标题+描述+模版+排期;标签/预估可在详情补,只要 typecheck 与测试通过)。

`todo-template-picker.tsx` — 下拉选模版 + 管理入口(新建/编辑/删除):

```tsx
import React from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoTemplate } from '../../../../shared/todo/todo-template'

export function TodoTemplatePicker({
  value,
  onSelect
}: {
  value: string | null
  onSelect: (template: TodoTemplate | null) => void
}): React.JSX.Element {
  const templates = useAppStore((s) => s.todoTemplates)
  return (
    <select
      className="rounded-md border border-border bg-background px-2 py-1.5 text-[13px]"
      value={value ?? ''}
      onChange={(e) => {
        const tpl = templates.find((t) => t.id === e.target.value) ?? null
        onSelect(tpl)
      }}
    >
      <option value="">
        {translate('auto.components.todo.TodoTemplatePicker.none', 'No template')}
      </option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
```

> 模版的新建/编辑/删除管理界面(spec §1.1 #5)可放一个"管理模版"弹窗(列表 + 增删改,调 `createTodoTemplate/updateTodoTemplate/deleteTodoTemplate`)。为控制 P1 范围,可在 picker 旁放一个齿轮按钮打开管理弹窗;实现者补 `TodoTemplateManagerDialog.tsx` 或内联。原生 `<select>` 是占位实现,若 STYLEGUIDE 要求用 shadcn `Select` 则替换。

`TodoDetailDialog.tsx` — 左 Markdown 预览 + 右侧栏改状态/优先级/排期/标签,每次改动调 `updateTodoItem`:

```tsx
import React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TodoStatusMenu } from './TodoStatusMenu'

export function TodoDetailDialog({
  itemId,
  onClose
}: {
  itemId: string
  onClose: () => void
}): React.JSX.Element | null {
  const item = useAppStore((s) => s.todoItems.find((i) => i.id === itemId) ?? null)
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  if (!item) {
    return null
  }
  const changeStatus = (status: TodoStatus): void => {
    void updateTodoItem(item.id, { status })
  }
  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="flex max-w-3xl gap-4">
        <div className="min-h-64 flex-1 overflow-auto">
          <h2 className="mb-2 text-base font-semibold">
            <span className="mr-2 text-muted-foreground">{item.identifier}</span>
            {item.title}
          </h2>
          <MarkdownPreview content={item.description || '_No description_'} />
        </div>
        <aside className="w-52 shrink-0 border-l border-border pl-4">
          <TodoStatusMenu value={item.status} onChange={changeStatus} />
        </aside>
      </DialogContent>
    </Dialog>
  )
}
```

> `MarkdownPreview` 的默认/具名导出与 prop 名(`content`)以实际文件为准(spec 记录为 `content: string`)。右侧栏的优先级/排期/标签编辑控件按同样"改动即 `updateTodoItem`"模式补齐。若 `MarkdownPreview` 是具名导出则改为 `import { MarkdownPreview }`。

- [ ] **第 4 步:跑测试,确认它通过**

运行:`pnpm exec vitest run src/renderer/src/components/todo/TodoStatusMenu.test.tsx src/renderer/src/components/todo/TodoCreateDialog.test.tsx`
预期:PASS。

- [ ] **第 5 步:提交**

```bash
git add src/renderer/src/components/todo/TodoStatusMenu.tsx src/renderer/src/components/todo/todo-template-picker.tsx src/renderer/src/components/todo/TodoCreateDialog.tsx src/renderer/src/components/todo/TodoDetailDialog.tsx src/renderer/src/components/todo/TodoStatusMenu.test.tsx src/renderer/src/components/todo/TodoCreateDialog.test.tsx
git commit -m "feat(todo): add create/detail dialogs, status menu, template picker"
```

---

## 任务 14：国际化文案（en / zh）

**涉及文件：**
- 修改：`src/renderer/src/i18n/locales/en.json`
- 修改：`src/renderer/src/i18n/locales/zh.json`

> `translate(key, fallback)` 在缺 key 时用 fallback 兜底,故功能不阻塞;但 lint 含 localization 校验(见任务 15),需补齐所有用到的 key。逐一收集前面任务里出现的 key。

- [ ] **第 1 步:收集本功能所有 i18n key**

从任务 9/11/12/13 出现的 key(每个都是 `auto.components.todo.*` 或 `auto.components.sidebar.SidebarTodoNavButton.*`):

- `auto.components.sidebar.SidebarTodoNavButton.title` → "TODO" / "待办"
- `auto.components.todo.status.{backlog,todo,in_progress,rework,human_review,merging,done,canceled,duplicate}` → 见任务 9 的 fallback / 中文:待办池、待办、进行中、返工、人工评审、合并中、已完成、已取消、重复
- `auto.components.todo.priority.{none,low,medium,high,urgent}` → No priority/Low/Medium/High/Urgent / 无优先级、低、中、高、紧急
- `auto.components.todo.TodoPage.{newTask,empty}` → "New task"/"Create a project to get started" / "新建任务"/"创建一个项目开始使用"
- `auto.components.todo.TodoCreateDialog.{title,titlePlaceholder,descPlaceholder,cancel,create}`
- `auto.components.todo.TodoTemplatePicker.none`

> 若实现者又新增了 key(如项目切换、模版管理、删除确认),同批补进 en/zh。

- [ ] **第 2 步:按现有 JSON 结构写入 `en.json` 与 `zh.json`**

按文件里既有的嵌套/扁平结构(参照 `auto.components.sidebar.SidebarNav.*` 现有写法)插入对应键值。en 用英文,zh 用中文。

- [ ] **第 3 步:跑 lint 的 localization 校验**

运行:`pnpm run lint`
预期:PASS(无缺失 key 报错)。

- [ ] **第 4 步:提交**

```bash
git add src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/zh.json
git commit -m "feat(todo): add en and zh localization strings"
```

---

## 任务 15：全量验证（完成前必须通过）

**涉及文件：** 无新增代码,仅验证。

- [ ] **第 1 步:类型检查**

运行:`pnpm run typecheck`
预期:PASS(node/cli/web 三套均无错误)。

- [ ] **第 2 步:Lint（含 switch 穷尽性 + localization 校验）**

运行:`pnpm run lint`
预期:PASS。若 `activeView` 有 switch 穷尽性报错,补 `'todos'` 分支。

- [ ] **第 3 步:测试**

运行:`pnpm test`(或 `pnpm exec vitest run src/shared/todo src/main/todos src/renderer/src/components/todo`)
预期:所有 todo 相关用例 PASS。

- [ ] **第 4 步:手动冒烟（dev）**

运行:`pnpm dev`(或项目实际的启动命令)。按序验证:
1. 侧栏出现 "TODO",点击进入 TodoPage。
2. 新建项目(name + prefix),看板显示 5 列。
3. 新建任务(可选模版填充描述 + 排期),卡片出现在对应列。
4. 拖拽卡片换列 / 列内排序,松手后位置保持。
5. 点卡片打开详情,改状态(下拉 9 项),卡片移动到新列;改排期/优先级生效。
6. 删除项目走二次确认,任务级联消失。
7. 重启应用,数据仍在(SQLite `todo.db` 持久化验证)。

预期:上述全部通过;无 console 报错。

- [ ] **第 5 步:最终提交(若手动验证有微调)**

```bash
git add -A
git commit -m "chore(todo): finalize P1 board after manual verification"
```

---

## 自我评审记录

**规格覆盖(对照 spec §1.1 目标):**
1. 侧栏 TODO 菜单 → 任务 11 ✅
2. 多项目创建/切换 → 任务 8(slice)+ 12(ProjectSwitcher)✅
3. 看板 5 可见列 + 拖拽换列/排序 → 任务 9(可见列)+ 12(Board/dnd)✅
4. 新建任务(标题/Markdown/状态/优先级/排期/标签/模版)→ 任务 13(CreateDialog)✅(标签/预估为可选补全,已在任务 13 备注)
5. 提示词模版 应内 增删改 + 新建时下拉填充 → 任务 8(slice CRUD)+ 13(picker;管理弹窗为备注补全项)⚠️ 部分:模版 CRUD slice/IPC 齐全,管理 UI 由实现者补
6. 任务详情 左 Markdown + 右改状态/优先级/排期/标签 → 任务 13(DetailDialog)✅
7. Todo 列"今天"默认视图 → 任务 9(today-filter)✅(列头"今天/全部"切换 UI 由实现者在 Column 接线,已备注)⚠️ 逻辑齐、接线待补
8. SQLite 持久化 + 版本化迁移 → 任务 4/5 ✅

**占位符扫描:** 无 "TBD/TODO/以后补" 类空步骤;所有涉及代码的步骤均含可运行代码。UI 任务(12/13)对超范围的精细控件(标签编辑、模版管理弹窗、Todo 列头切换、ProjectSwitcher 细节)用"备注 + 明确接口"形式交代,不是占位符——核心链路(建项目→建任务→拖拽→改状态→持久化)代码完整。

**类型一致性:** `TodoStatus`/`TodoPriority`/`TodoItem`/`CreateTodoItemInput`/`UpdateTodoItemPatch` 贯穿 shared→repo→ipc→preload→slice→组件一致;`orderKeyBetween(before,after)` 签名在 order-key/repo/Board 一致;`getTodoStatusMeta`/`getVisibleTodoStatuses`/`isTodoDueToday`/`buildCreateTodoPayload` 名称在定义与调用处一致;`window.api.todos.*` 的方法签名在 preload 实现与 api-types 声明一致。

**已知需实现者按实际源码微调的点(非缺陷,是锚点核对):**
- `orca-runtime.ts` 的 `registerCoreHandlers` 运行时参数名 / `join` 导入。
- `api-types.ts` 到 `shared` 的相对路径前缀。
- `ui.ts` 的 `activeView` 类型别名名称、`recordViewVisit` 对新 view 的接受。
- `App.tsx` view 渲染是条件表达式还是 switch;`RecoverableRenderErrorBoundary` 的 props。
- `MarkdownPreview` 默认导出 vs 具名导出及 prop 名。
- lucide 图标名在当前版本的可用性。

---

## 交接执行

计划完成,已保存到 `.dmonwork/plans/2026-07-11-todo-board-p1.md`。两种执行方式:

**1. Subagent 驱动(推荐)** —— 我为每个任务派一个全新的子 agent,任务之间做评审,快速迭代。

**2. 内联执行** —— 在当前会话里用 ddd-executing-plans 执行任务,分批执行、在检查点处停下来评审。

选哪种?
