# TODO 任务管理看板 — P1 设计文档

- 日期：2026-07-11
- 阶段：P1（骨架 + 本地看板，不接引擎）
- 作者：需求分析产出（待评审）

---

## 0. 背景与总体蓝图

在 Orca（`/Users/eleme/Documents/github/orca`，Electron + React）中新增一个**本地自管的 TODO 任务管理**功能：多项目看板，任务按状态列（Backlog / Todo / In Progress / Human Review / Done 等）流转；进入 In Progress 时用 AI 编码引擎执行，一个引擎 Session 对应一个任务。

该功能横跨多个相对独立的子系统，按依赖顺序拆成 4 个阶段，每阶段独立 spec → plan → 实现：

| 阶段 | 范围 | 依赖 |
|---|---|---|
| **P1（本文档）** | 侧栏菜单 + 多项目看板 + 新建/模版 + 详情 Markdown 预览 + 改状态/排期/优先级 + SQLite 持久化。可独立跑通，不接引擎。 | 无 |
| P2 | ACP 执行层（qoder/claude 走 ACP，cursor 等回退 PTY）+ In Progress 详情（plan / 进度 / session 对话）。 | P1 |
| P3 | Human Review：内嵌 `BrowserPane` + 移动端叠层 + 对话验证。 | P2 |
| P4 | Done 数据看板（Token 复用 `claude-usage`，Skill/SubAgent/人工介入次数新建埋点）。 | P2 |

**执行层已决策（P2 落地）**：混合方案 —— ACP 优先，不支持 ACP 的引擎回退到现有 PTY-TUI 机制。P1 不实现执行，但数据模型为其预留。

**关键约束（贯穿全部阶段）**：
- 跨平台：macOS / Linux / Windows。路径用 `path.join`；快捷键用平台判断（Mac `metaKey`、其他 `ctrlKey`），菜单加速器用 `CmdOrCtrl`。
- SSH 场景：不假设本地执行。
- 设计系统：所有 UI 遵循 `docs/STYLEGUIDE.md`，用 `src/renderer/src/assets/main.css` 的 token 与 `src/renderer/src/components/ui/` 的 shadcn 基元，不新造颜色/字号/阴影。
- 命名：不使用 `helpers/utils/common/misc/shared` 等空泛名，文件按其承载的领域概念命名。
- 不禁用 `max-lines`：文件过大时拆分模块。

---

## 1. 范围（P1）

### 1.1 目标（In Scope）
1. 侧栏新增 "TODO" 顶层菜单，点击进入 TODO 整页视图。
2. 多项目：可创建/切换项目（Project/Board），任务归属某项目。
3. 看板视图：按 9 状态分列（默认展示 5 列 + 隐藏列），卡片可拖拽换列/列内排序。
4. 新建任务：标题、Markdown 描述、状态、优先级、排期、标签、可选提示词模版填充。
5. 提示词模版：应内新建/编辑/删除模版；新建任务时下拉选模版填充描述。
6. 任务详情：左侧 Markdown 预览，右侧栏改状态 / 优先级 / 排期 / 标签。
7. Todo 列默认视图：展示"排期日期 ≤ 今天 或 已逾期未完成"的任务。
8. 本地 SQLite 持久化（`todo.db`），版本化迁移。

### 1.2 非目标（Out of Scope，留待后续阶段）
- 引擎执行、ACP、In Progress 对话（P2）。
- Human Review 浏览器/模拟器（P3）。
- Done 数据看板与埋点（P4）。
- Assignee（负责人）：个人 agentic 工具，P2 再议。
- 标签的规范化独立表 / 按标签过滤（P1 标签仅存储与展示；需要过滤时再规范化）。
- 附件、评论、活动流（截图中出现，但非 P1 核心）。

---

## 2. 数据模型

新建 `src/shared/todo/`，按职责拆分文件（供主/渲染共享类型）：

### 2.1 `src/shared/todo/todo-status.ts`
```ts
export type TodoStatus =
  | 'backlog' | 'todo' | 'in_progress' | 'rework'
  | 'human_review' | 'merging' | 'done' | 'canceled' | 'duplicate';
```
状态元数据集中在渲染层 `todo-status-catalog.tsx`（见 §5），字段：`id / label(i18n key) / colorToken / icon(lucide) / defaultVisibleColumn(bool) / terminal(bool) / order(number 1..9)`。

- 默认可见列（看板）：`backlog, todo, in_progress, human_review, done`。
- 隐藏列/终态：`rework, merging, canceled, duplicate`（终态：`done, canceled, duplicate`）。
- 顺序严格照改状态下拉截图：Backlog(1) Todo(2) In Progress(3) Rework(4) Human Review(5) Merging(6) Done(7) Canceled(8) Duplicate(9)。

### 2.2 `src/shared/todo/todo-priority.ts`
```ts
export type TodoPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
```
（Linear 风格五档，`none` 为默认。）

### 2.3 `src/shared/todo/todo-item.ts`
```ts
export interface TodoItem {
  id: string;                 // uuid
  identifier: string;         // 如 "MT-891"，项目前缀 + 自增号
  projectId: string;
  title: string;
  description: string;        // Markdown
  status: TodoStatus;
  priority: TodoPriority;
  scheduledDate: string | null; // 排期，ISO date (YYYY-MM-DD)，可空
  estimate: number | null;    // 预估点数，可空
  labels: string[];           // P1：JSON 数组存于单列
  templateId: string | null;  // 创建时所用模版，可空
  orderKey: string;           // 列内排序键（分数索引/lexo-rank 风格字符串）
  createdAt: string;          // ISO datetime
  updatedAt: string;
  startedAt: string | null;   // 进入 in_progress 时间（P2 用，P1 预留）
  completedAt: string | null; // 进入终态时间
}
```

### 2.4 `src/shared/todo/todo-project.ts`
```ts
export interface TodoProject {
  id: string;
  name: string;
  identifierPrefix: string;   // 如 "MT"，[A-Za-z0-9]{1,10}
  nextSequence: number;       // 下一个 identifier 序号，从 1 起
  createdAt: string;
  updatedAt: string;
}
```

### 2.5 `src/shared/todo/todo-template.ts`
```ts
export interface TodoTemplate {
  id: string;
  name: string;
  body: string;               // Markdown / 提示词正文（可含变量占位，P1 仅原样填充）
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. 持久化（SQLite）

**决策**：用 SQLite 而非 JSON 单文件。复用 Orca 现有 `node:sqlite` 封装与版本化迁移最佳实践（无 native 依赖、跨平台、可关系查询、迁移健壮）。

### 3.1 复用的基建
- 连接封装：`src/main/sqlite/sync-database.ts` 的 `SyncDatabase`（`import` 后 `new`，暴露 `exec/prepare/pragma/close`）。
- 迁移范本：`src/main/runtime/orchestration/db.ts` 的 `OrchestrationDb`（`SCHEMA_VERSION` 常量 + `PRAGMA user_version` + `createTables()` 幂等建表 + `migrate()` 事务化逐级 ALTER + `hasColumn()` 探测）。**照抄此结构**。
- **不照抄** dmon-work-electron 的 `ALTER...ADD COLUMN + try/catch` 迁移。

### 3.2 数据库文件
- 位置：`path.join(app.getPath('userData'), 'todo.db')`（独立库，与 `orchestration.db` 隔离）。
- Pragma：`journal_mode = WAL`、`foreign_keys = ON`、`busy_timeout`、`synchronous = NORMAL`（对齐 `OrchestrationDb` 构造）。

### 3.3 Schema 层 `src/main/todos/todo-database.ts`
`SCHEMA_VERSION = 1`。`createTables()` 建三张表（`CREATE TABLE IF NOT EXISTS`）：

```sql
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
  labels TEXT NOT NULL DEFAULT '[]',   -- JSON 数组
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
```

`migrate(current)`：P1 仅 v1，无历史迁移；预留 `migrate()` 骨架以便 P2/P4 加列（如 `session_id`、指标字段）走事务化 ALTER。

### 3.4 访问层 `src/main/todos/todo-repository.ts`
纯函数式 DAO（参考 `dmon .../orchestrator/taskStore.ts` 的 `rowToTask` 映射思路，但用 Orca 同步 API），持有 `SyncDatabase` 实例：
- 项目：`listProjects / createProject / renameProject / deleteProject`。
- 任务：`listItems(projectId) / getItem(id) / createItem(input) / updateItem(id, patch) / deleteItem(id) / moveItem(id, status, orderKey)`。
- 模版：`listTemplates / createTemplate / updateTemplate / deleteTemplate`。
- `createItem`：在同一事务内读 `todo_projects.next_sequence` 生成 `identifier = prefix + '-' + seq`，并 `next_sequence += 1`。
- row ↔ 对象映射（snake_case ↔ camelCase，labels JSON parse/stringify）集中在本文件的 `rowToTodoItem` / `todoItemToRow`。

### 3.5 主进程装配
- 在 `src/main/runtime/orca-runtime.ts` 现有 DB 初始化处附近（参考 `orchestration.db` 在 ~L2572 的创建/注入）new 出 `TodoDatabase` 单例，供 IPC handler 使用。
- 迁移在构造时自动执行（`user_version` 判断）。

### 3.6 IPC / preload / 渲染访问（照 Automations 全链路）
- `src/main/ipc/todos.ts`：`registerTodoHandlers(todoRepo)`，注册 `todos:projects:list/create/rename/delete`、`todos:items:list/get/create/update/delete/move`、`todos:templates:list/create/update/delete`。
- 注册入口：`src/main/ipc/register-core-handlers.ts` 中 import + 调用。
- preload：`src/preload/index.ts` 暴露 `window.api.todos.{projects,items,templates}.*`；类型加到 `src/preload/api-types.ts`。
- 渲染层：`src/renderer/src/store/slices/todos.ts`（zustand slice）做内存缓存 + 乐观更新，所有写操作 `await window.api.todos.*` 后同步缓存。

---

## 4. 导航接入

模仿 **Automations** 全链路（侧栏 + open/close action + 整页）。命名空间用 `todos`（不与既有 `tasks` / `work-item` / `kanban` / `workspace-status` / `project` 撞车）。

1. **`src/renderer/src/store/slices/ui.ts`**
   - `activeView` 联合类型（~L547）新增 `'todos'`。
   - 新增 `previousViewBeforeTodos` + `openTodosPage()` / `closeTodosPage()`（参考 `openAutomationsPage/closeAutomationsPage`）。
2. **`src/renderer/src/App.tsx`**
   - lazy import（~L280-285 附近）：`const TodoPage = lazy(() => import('./components/todo/TodoPage'))`。
   - 主区域条件渲染（~L2299-2305 附近）加：`{activeView === 'todos' ? <TodoPage/> : null}`，外层沿用 `RecoverableRenderErrorBoundary`（boundaryId `page.todos`）+ `<Suspense>`。
3. **侧栏**：新增 `src/renderer/src/components/sidebar/SidebarTodoNavButton.tsx`（参考 `SidebarTaskNavButton.tsx`，图标 lucide `ListTodo`，`onClick → openTodosPage()`，`aria-current` 由 `activeView === 'todos'` 决定）；在 `src/renderer/src/components/sidebar/SidebarNav.tsx` 中把它渲染在现有"任务"条目附近（截图指示的位置）。

---

## 5. UI 组件（`src/renderer/src/components/todo/`）

全部遵循 `docs/STYLEGUIDE.md` 与 shadcn 基元。

| 文件 | 职责 |
|---|---|
| `TodoPage.tsx` | 整页壳：页头（项目切换下拉、Filter 入口、"新建任务"按钮）+ `TodoBoard`。首帧从 `todos` slice 加载。 |
| `TodoBoard.tsx` | `@dnd-kit` 看板容器（`DndContext`），渲染可见状态列；处理跨列拖拽 + 列内排序，落 `moveItem`。拖拽逻辑参考 `tab-bar/SortableTab.tsx`、插入位计算参考 `tab-group/tab-insertion.ts`。 |
| `TodoColumn.tsx` | 单状态列：列头（状态图标/名/计数）、`SortableContext`、列内卡片列表、列尾"+"新建。 |
| `TodoCard.tsx` | 卡片：identifier、标题、状态图标、优先级/排期/标签小标。`useSortable`。点击打开详情。 |
| `TodoCreateDialog.tsx` | 新建任务弹窗（参考 Image #6）：标题、Markdown 描述、模版下拉（`todo-template-picker`）、状态/优先级/排期/标签/预估快选。用 shadcn `Dialog`。 |
| `TodoDetailDialog.tsx` | 详情（参考 Image #7）：左 Markdown 预览（复用 `editor/MarkdownPreview.tsx`），右侧栏 `TodoStatusMenu` + 优先级/排期/标签编辑。 |
| `TodoStatusMenu.tsx` | 改状态下拉（严格照 Image #7 的 9 项，带序号 1..9 与状态图标/颜色）。 |
| `todo-template-picker.tsx` | 模版选择 + 管理入口（新建/编辑/删除模版）。 |
| `todo-status-catalog.tsx` | 9 状态元数据（label i18n key / colorToken / lucide icon / 默认可见 / 终态 / 顺序）。 |
| `todo-today-filter.ts` | Todo 列"今天"过滤：`status === 'todo'` 且（`scheduledDate == null` 或 `scheduledDate <= today`）；逾期未完成同样纳入。纯函数，单测覆盖。 |
| `todo-priority-catalog.tsx` | 5 档优先级元数据（label / icon / colorToken）。 |

拖拽库：项目已装 `@dnd-kit/core` + `@dnd-kit/sortable`，直接用，不新增依赖。

---

## 6. 交互行为要点

- **改状态即移动**：详情页或卡片改状态 → `updateItem` 同时更新 `status`；若进终态写 `completedAt`。看板拖拽 → `moveItem(status, orderKey)`。
- **identifier 生成**：新建任务时后端事务内取项目 `next_sequence`，格式 `PREFIX-序号`。
- **Todo"今天"语义**：见 `todo-today-filter.ts`。看板 Todo 列头可切换"今天/全部"（默认今天）。
- **模版填充**：选模版 → 用 `template.body` 填入描述输入框（可继续编辑）；记录 `templateId`。
- **空状态**：无项目时引导创建第一个项目；项目无任务时列显示占位。
- **删除确认**：删除项目（级联删任务）需二次确认弹窗。

---

## 7. 国际化

- 文案用 `translate('auto.components.todo.<组件>.<key>', 'English fallback')`（`src/renderer/src/i18n/i18n.ts`）。
- 至少补齐 `en` 与 `zh`（`src/renderer/src/i18n/locales/{en,zh}.json`），其余语言可后补（fallback 兜底）。
- 需覆盖：菜单名、状态名 ×9、优先级 ×5、按钮/占位/确认文案。

---

## 8. 测试策略（TDD）

先写测试再实现。Vitest（`config/vitest.config.ts`）。

- **repository 单测**（`src/main/todos/*.test.ts`）：CRUD、identifier 自增（并发/事务）、labels JSON 往返、级联删除、`moveItem` 排序键、迁移建表幂等（内存/临时文件 db）。
- **纯逻辑单测**：`todo-today-filter.ts`（今天/逾期/无排期边界）、`orderKey` 生成、status catalog 的可见/终态断言。
- **组件测试**（可行范围）：`TodoCreateDialog` 提交产出正确 payload、`TodoStatusMenu` 选项与序号、`TodoBoard` 列渲染。
- **导航冒烟**：`activeView='todos'` 渲染 `TodoPage` 不崩（参考 `app-startup-routing.test.ts` 风格）。

---

## 9. 验证清单（完成前必须通过）

- `pnpm run typecheck`（node/cli/web 三套）通过。
- `pnpm run lint`（含 switch 穷尽性、localization 校验）通过。
- `pnpm test` 相关用例通过。
- 手动：启动 dev，点击侧栏 TODO → 建项目 → 建任务（含模版）→ 拖拽换列 → 打开详情改状态/排期/优先级 → 重启应用数据仍在（SQLite 持久化验证）。

---

## 10. 待后续阶段衔接的预留点

- `todo_items.started_at / completed_at`、`template_id`：P2 执行时写入。
- 迁移骨架：P2 加 `session_id`（任务↔引擎 session 映射）、P4 加指标列或独立指标表，均走 `user_version` 事务化 ALTER。
- 状态语义固定（9 状态），与 P2 ACP 自动流转（如执行完自动进 human_review）对齐。

---

## 11. 关键文件清单（新增 / 修改）

**新增**
- `src/shared/todo/{todo-status,todo-priority,todo-item,todo-project,todo-template}.ts`
- `src/main/todos/{todo-database,todo-repository}.ts`（+ 对应 `*.test.ts`）
- `src/main/ipc/todos.ts`
- `src/renderer/src/store/slices/todos.ts`
- `src/renderer/src/components/sidebar/SidebarTodoNavButton.tsx`
- `src/renderer/src/components/todo/{TodoPage,TodoBoard,TodoColumn,TodoCard,TodoCreateDialog,TodoDetailDialog,TodoStatusMenu}.tsx`
- `src/renderer/src/components/todo/{todo-template-picker,todo-status-catalog,todo-priority-catalog}.tsx`
- `src/renderer/src/components/todo/todo-today-filter.ts`

**修改**
- `src/main/runtime/orca-runtime.ts`（装配 `TodoDatabase` 单例）
- `src/main/ipc/register-core-handlers.ts`（注册 todo handlers）
- `src/preload/index.ts` + `src/preload/api-types.ts`（暴露 `window.api.todos.*`）
- `src/renderer/src/store/slices/ui.ts`（`activeView` 加 `'todos'` + open/close）
- `src/renderer/src/App.tsx`（lazy import + 条件渲染）
- `src/renderer/src/components/sidebar/SidebarNav.tsx`（渲染新按钮）
- `src/renderer/src/i18n/locales/{en,zh}.json`（文案）
