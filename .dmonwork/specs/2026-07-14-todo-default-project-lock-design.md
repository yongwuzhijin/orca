# 待办内置默认项目（锁定、不可切换）— 设计文档

- 日期：2026-07-14
- 状态：已确认
- 前置：Todo Board P1–P4b（多项目看板已落地）

---

## 1. 背景与目标

待办页保留 `TodoProject` 数据模型，但产品上改为**单看板体验**：

1. 内置一个固定默认项目，启动/加载时保证存在。
2. 始终选中该默认项目。
3. 用户不能切换、新建或删除项目；页头去掉项目切换器。
4. 历史用户自建项目及其任务**留在库中但不在 UI 中展示**（不迁移、不删除）。

成功标准：打开待办即可直接「新建任务」与看 Board/Data，无需先建项目；页头无项目下拉。

---

## 2. 非目标

- 不做旧任务迁移到默认项目。
- 不删库中其它 `todo_projects` / 其下 `todo_items`。
- 不恢复多项目 UI（本阶段不提供「将来再开」开关）。
- 不改任务状态机、ACP、评审、合并、Data 看板业务逻辑（仅收窄项目作用域）。

---

## 3. 数据与主进程

### 3.1 常量

| 字段 | 值 |
|------|-----|
| `id` | `todo-default` |
| `name` | `Default` |
| `identifierPrefix` | `TODO` |

常量放在共享层（如 `src/shared/todo/todo-default-project.ts`），主进程与渲染层共用，避免魔法字符串分叉。

### 3.2 `ensureDefaultProject()`

在 `TodoRepository`（或等价入口）新增幂等方法：

- 按 `id = todo-default` 查询；
- 不存在则插入（`next_sequence = 1`，`default_working_dir = null`，时间戳正常）；
- 已存在则原样返回（不覆盖用户可能改过的 `defaultWorkingDir` 等字段）。

调用时机：`listProjects` 前，或 IPC `todos.projects.list` 处理时先 ensure 再 list。推荐 **list 入口 ensure**，保证任何读路径都有默认项目。

### 3.3 旧数据策略

- 其它 `project_id ≠ todo-default` 的行保持不动。
- UI / store 只加载并展示默认项目下的 items。
- Dashboard `getMetrics({ projectId })` 只传 `todo-default`。

---

## 4. 渲染层

### 4.1 Store（`todos` slice）

- `loadTodoProjects`：list 后强制 `todoActiveProjectId = DEFAULT_TODO_PROJECT_ID`（不采用「第一个项目」启发式）。
- `loadTodoItems` 始终针对该 id。
- 新建任务的 `projectId` 固定为默认 id。
- `setActiveTodoProject` / `createTodoProject` / `deleteTodoProject`：UI 不再调用；IPC 可保留以降低改动面（YAGNI：不强制删 API）。

### 4.2 `TodoPage`

- 移除 `TodoProjectSwitcher` 及其「无项目」空态文案分支。
- 页头：`Board` / `Data` tabs +「新建任务」。
- `activeProjectId` 在 ensure 后恒有值；「新建任务」不再因无项目而 disabled（除非加载失败，可另议，本设计不扩错误态 UI）。

### 4.3 其它引用

- 凡依赖「用户选中的项目」的路径，改为默认常量。
- `TodoProjectSwitcher.tsx`：可保留文件但不再挂载，或删除组件及仅服务于切换器的测试——实现时选改动更小者（推荐停止挂载 + 删/改相关测试）。

---

## 5. 测试

| 层级 | 断言 |
|------|------|
| repository | `ensureDefaultProject` 幂等；第二次调用不新建第二条；id/name/prefix 符合常量 |
| list 路径 | list 后至少包含 `todo-default` |
| store / page | 加载后 `todoActiveProjectId === 'todo-default'`；页头无项目切换相关文案/控件；无「Create a project to get started」 |
| 回归 | Board 新建任务、Data 看板仍按 `projectId` 过滤且使用默认 id |

---

## 6. 风险与取舍

- **旧任务不可见**：符合产品选择 A；若日后要找回，需另开「迁移/导入」需求。
- **固定 id**：跨设备/重装后仍是同一逻辑项目；本地库若人为删掉该行，下次 list 会重建（旧 `todo-default` 任务若曾存在会随新行继续挂同 id——仅当行被删而 items 仍引用同 id 时 SQLite FK 行为需注意：删除项目会 CASCADE items；重建空项目不恢复已删任务。本设计不主动删默认项目）。
- **IPC 仍可多项目**：不构成产品能力；后续若要彻底锁死可再禁 create/delete。

---

## 7. 实现顺序（摘要）

1. 共享常量 + repository `ensureDefaultProject` + 测试  
2. list/IPC 接入 ensure  
3. store 强制 active = 默认 id + 测试  
4. `TodoPage` 去掉切换器与空项目引导 + 测试更新  
5. 跑相关 vitest 确认绿灯  
