# Todo Start Auto-Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ddd-subagent-driven-development (recommended) or ddd-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开始任务时自动创建 worktree 并在其中跑智能体；详情全阶段展示工作区信息；侧栏对应 Orca 项目下用「需求列表」展示未完结绑定工作区，完结后仅从列表移除、不删磁盘。

**Architecture:** 新增 `boundWorktreeId` 持久化；纯函数解析名称/主项目 repo；开始确认时 `createWorktree` → 写绑定 → 再改状态并启动 ACP/终端。侧栏在 repo 分组行构建时按 todo 索引把活跃绑定 worktree 抽到「需求列表」子组。

**Tech Stack:** TypeScript、React、Zustand、SQLite todo.db、Vitest、既有 `createWorktree` / `slugifyForWorkspaceName` / 侧栏 `appendWorktreeRows`

**Spec:** `.dmonwork/specs/2026-08-28-todo-start-auto-worktree-design.md`

## Global Constraints

- UI 文案必须 `translate('key', 'English fallback')`，并更新 `en`/`zh`/`ja`/`ko`/`es`。
- 完结时禁止调用删除 worktree API。
- 多项目只给主项目（`workspaceProjectId`）建区。
- Folder-only 主项目（非 git）：开始时 toast「暂不支持」，不创建。
- 状态仅在 `createWorktree` 成功后再翻到 `in_progress` / `solution_design`。
- 禁止 `eslint-disable max-lines`。

---

## File Structure

**Shared / main**
- `src/shared/todo/todo-item.ts` — 加 `boundWorktreeId`
- `src/shared/todo/todo-workspace-name.ts` — `resolveTodoWorkspaceName(item)`
- `src/shared/todo/todo-requirement-worktrees.ts` — 活跃绑定 worktree 索引纯函数
- `src/main/todos/todo-database.ts` — schema v9 `bound_worktree_id`
- `src/main/todos/todo-row-mapping.ts` / `todo-item-store.ts` / `todo-repository.ts`

**Renderer**
- `src/renderer/src/components/todo/detail/todo-start-workspace.ts` — 解析 repo + createWorktree
- `src/renderer/src/components/todo/detail/todo-terminal-task-start.ts` — 按 worktreeId 启动
- `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx` — 去 picker，接创建流
- `src/renderer/src/components/todo/detail/TodoDetailWorkspaceMeta.tsx` — 属性栏展示
- `src/renderer/src/components/todo/detail/TodoDetailView.tsx` — 挂载 meta
- `src/renderer/src/components/sidebar/worktree-list/grouping/requirement-worktree-partition.ts`
- `src/renderer/src/components/sidebar/worktree-list/grouping/group-sections.ts` — 注入需求子组
- i18n 五语 locale

---

### Task 1: `boundWorktreeId` 数据层

**Files:**
- Modify: `src/shared/todo/todo-item.ts`
- Modify: `src/main/todos/todo-database.ts`
- Modify: `src/main/todos/todo-row-mapping.ts`
- Modify: `src/main/todos/todo-item-store.ts`
- Modify: `src/main/todos/todo-repository.ts`
- Modify: `src/main/todos/todo-database.test.ts`
- Modify: 所有构造 `TodoItem` 的测试 fixture（补 `boundWorktreeId: null`）

**Interfaces:**
- Produces: `TodoItem.boundWorktreeId: string | null`；`CreateTodoItemInput` / `UpdateTodoItemPatch` 可选同字段；schema `SCHEMA_VERSION = 9`

- [ ] **Step 1: 写失败测试（schema / round-trip）**

在 `todo-database.test.ts` 增加：

```ts
it('ships schema version 9 with bound_worktree_id', () => {
  const d = createDb()
  expect(SCHEMA_VERSION).toBe(9)
  const cols = (d.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
  expect(cols).toContain('bound_worktree_id')
})
```

在 `todo-repository.test.ts`（或现有 create/update 测）增加 update `boundWorktreeId` round-trip。

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm test src/main/todos/todo-database.test.ts`
Expected: FAIL — version still 8 / 无列

- [ ] **Step 3: 最小实现**

- `TodoItem` / Create / Update 加 `boundWorktreeId`
- `SCHEMA_VERSION = 9`；CREATE + migrate `ALTER TABLE ... bound_worktree_id TEXT`
- row mapping / insert / update 读写该列
- fixture 补 `boundWorktreeId: null`

- [ ] **Step 4: 跑测确认通过**

Run: `pnpm test src/main/todos/todo-database.test.ts src/main/todos/todo-repository.test.ts`

- [ ] **Step 5: Commit**（仅当用户要求提交时执行；否则跳过）

```bash
git add src/shared/todo/todo-item.ts src/main/todos/
git commit -m "$(cat <<'EOF'
feat(todo): persist boundWorktreeId for requirement workspaces

EOF
)"
```

---

### Task 2: 工作区名称与主项目解析（纯函数）

**Files:**
- Create: `src/shared/todo/todo-workspace-name.ts`
- Create: `src/shared/todo/todo-workspace-name.test.ts`
- Create: `src/shared/todo/resolve-todo-start-repo.ts`
- Create: `src/shared/todo/resolve-todo-start-repo.test.ts`

**Interfaces:**
- Consumes: `TodoItem`；`slugifyForWorkspaceName` from `src/shared/workspace-name.ts`；`ProjectHostSetup`
- Produces:
  - `resolveTodoWorkspaceName(item: Pick<TodoItem, 'workspaceName' | 'title'>): string`
  - `resolveTodoStartRepo(args: { workspaceProjectId: string | null; projectHostSetups: readonly ProjectHostSetup[] }): { repoId: string; projectPath: string; kind?: string } | null`  
    — 要求 `setupState === 'ready'` 且 `path` 非空；无则 `null`

- [ ] **Step 1: 写失败测试**

```ts
// todo-workspace-name.test.ts
it('prefers workspaceName over title', () => {
  expect(resolveTodoWorkspaceName({ workspaceName: '  feat-x  ', title: 'Ignore' })).toBe('feat-x')
})
it('slugifies title when workspaceName empty', () => {
  expect(resolveTodoWorkspaceName({ workspaceName: null, title: '测试需求链路' }).length).toBeGreaterThan(0)
})

// resolve-todo-start-repo.test.ts
it('returns null when no ready setup', () => {
  expect(resolveTodoStartRepo({ workspaceProjectId: 'p1', projectHostSetups: [] })).toBeNull()
})
it('returns repoId and path from ready setup', () => {
  expect(
    resolveTodoStartRepo({
      workspaceProjectId: 'p1',
      projectHostSetups: [
        {
          id: 's1',
          projectId: 'p1',
          hostId: 'local',
          repoId: 'r1',
          path: '/repo',
          displayName: 'r',
          setupState: 'ready',
          setupMethod: 'imported-existing-folder',
          createdAt: 1,
          updatedAt: 1
        }
      ]
    })
  ).toEqual({ repoId: 'r1', projectPath: '/repo', kind: undefined })
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `pnpm test src/shared/todo/todo-workspace-name.test.ts src/shared/todo/resolve-todo-start-repo.test.ts`

- [ ] **Step 3: 实现纯函数**

`resolveTodoWorkspaceName`：trim `workspaceName`；否则 `slugifyForWorkspaceName(title)`；若 slug 为空回退 `'workspace'`。

`resolveTodoStartRepo`：按 `projectId` 找第一个 ready + 非空 path 的 setup。

- [ ] **Step 4: 跑测通过**

Run: 同上

- [ ] **Step 5: Commit**（用户要求时）

---

### Task 3: `startTodoWorkspace` 创建助手

**Files:**
- Create: `src/renderer/src/components/todo/detail/todo-start-workspace.ts`
- Create: `src/renderer/src/components/todo/detail/todo-start-workspace.test.ts`
- Modify: `src/renderer/src/components/todo/detail/todo-terminal-task-start.ts` — 改为接收 `worktreeId` 为主路径

**Interfaces:**
- Consumes: `resolveTodoWorkspaceName`、`resolveTodoStartRepo`；`useAppStore.getState().createWorktree`；`repos` 用于判断 git
- Produces:
```ts
export type TodoStartWorkspaceResult =
  | { ok: true; worktreeId: string; path: string; displayName: string }
  | { ok: false; reason: 'no-project' | 'unsupported-folder' | 'create-failed'; message: string }

export async function startTodoWorkspace(item: TodoItem): Promise<TodoStartWorkspaceResult>
```
- `createWorktree(repoId, name, undefined, 'skip', undefined, 'unknown', displayName)` — displayName 可用原始 title / workspaceName
- Folder repo（`kind === 'folder'` 或非 git）：返回 `unsupported-folder`
- `startTodoViaTerminal({ worktreeId, agent, prompt })` — 用 `activateAndRevealWorktree(worktreeId, { startup })`，不再依赖 cwd 反查（保留 cwd 反查仅作 fallback）

- [ ] **Step 1: 写失败测试（mock store）**

测：无 project → `no-project`；create 被调用且成功返回 worktreeId。

- [ ] **Step 2: 跑测失败**

Run: `pnpm test src/renderer/src/components/todo/detail/todo-start-workspace.test.ts`

- [ ] **Step 3: 实现**

- [ ] **Step 4: 跑测通过**

- [ ] **Step 5: Commit**（用户要求时）

---

### Task 4: 接线 `EnterInProgressDialog`

**Files:**
- Modify: `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx`
- Modify: `src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`
- Modify: i18n 五语（无项目 / 创建中 / folder 不支持）

**Interfaces:**
- Consumes: `startTodoWorkspace`、`startTodoViaTerminal`、`executeTask`
- 行为：移除 `TodoWorkspaceProjectPicker` 与 `workspaceProjectId` 本地 state；`canStart` 改为「主项目可解析 + 智能体可用」；confirm：
  1. `startTodoWorkspace(item)`  
  2. 失败 → toast，return  
  3. `updateTodoItem`（含 `boundWorktreeId`、status、executionMode、preferredAgent、templateId…）  
  4. ACP：`executeTask({ cwd: result.path, … })`；终端：`startTodoViaTerminal({ worktreeId: result.worktreeId, … })`  
  5. loading 态防连点

- [ ] **Step 1: 更新/新增测试**

- 无工作目录 label/picker  
- confirm 时 mock `startTodoWorkspace` 成功后再 `updateTodoItem` / `executeTask`  
- create 失败不调用 `executeTask`

- [ ] **Step 2: 跑测失败**

Run: `pnpm test src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`

- [ ] **Step 3: 实现 UI + confirm 流 + i18n**

- [ ] **Step 4: 跑测通过**

- [ ] **Step 5: Commit**（用户要求时）

---

### Task 5: 详情属性栏展示工作区信息

**Files:**
- Create: `src/renderer/src/components/todo/detail/TodoDetailWorkspaceMeta.tsx`
- Create: `src/renderer/src/components/todo/detail/TodoDetailWorkspaceMeta.test.tsx`
- Modify: `src/renderer/src/components/todo/detail/TodoDetailView.tsx` — aside 内挂载
- Modify: i18n 五语

**Interfaces:**
- Props: `{ item: TodoItem }`
- 展示：
  - 工作区名称：bound worktree 的 `displayName`/`branch`；否则 `workspaceName` 或标题 slug 预览；无则「未设置」
  - 项目路径：主项目 ready setup `path`
  - 工作区路径：bound worktree `path`（有则显示）
- 有 `boundWorktreeId` 且 worktree 存在时，路径可点击 → `activateAndRevealWorktree`

- [ ] **Step 1: 写组件测试（创建前/后文案）**

- [ ] **Step 2: 跑测失败**

- [ ] **Step 3: 实现并挂到 `TodoDetailView` aside（计划日期上方或下方均可，推荐在状态块之后）**

- [ ] **Step 4: 跑测通过**

- [ ] **Step 5: Commit**（用户要求时）

---

### Task 6: 侧栏「需求列表」分组

**Files:**
- Create: `src/shared/todo/todo-requirement-worktrees.ts`
- Create: `src/shared/todo/todo-requirement-worktrees.test.ts`
- Create: `src/renderer/src/components/sidebar/worktree-list/grouping/requirement-worktree-partition.ts`
- Create: `src/renderer/src/components/sidebar/worktree-list/grouping/requirement-worktree-partition.test.ts`
- Modify: `src/renderer/src/components/sidebar/worktree-list/grouping/group-sections.ts`（或 `row-builders.ts` / `appendWorktreeRows` 调用处）
- Modify: `src/renderer/src/components/sidebar/worktree-list/grouping/row-types.ts` — 如需 `requirements-subheader` 行类型
- Wire: `buildRows` / WorktreeList 传入 `todoItems`（从 store 读活跃绑定）
- Modify: i18n 五语 — `Requirements` / `需求列表`

**Interfaces:**
```ts
// shared
export function listActiveBoundWorktreeIds(items: readonly TodoItem[]): Set<string>
// 非终态 && boundWorktreeId 非空

export function partitionRequirementWorktrees(
  items: readonly Worktree[],
  activeBoundIds: ReadonlySet<string>
): { requirement: Worktree[]; rest: Worktree[] }
```

在 `appendOrderedGroups`（`groupBy === 'repo'`）对每个 repo 的 `group.items`：
1. partition  
2. 若 `requirement.length > 0`：先 push header 行 `{ type: 'header', key: `${key}:requirements`, label: translate(...), count, projectGroupDepth: (depth+1) }`，再 `appendWorktreeRows(requirement)`，再 `appendWorktreeRows(rest)`  
3. 否则保持原逻辑

**完结行为：** todo 变终态后 `listActiveBoundWorktreeIds` 不再含该 id → 自动落入 `rest`（普通列表）。不调用删除。

- [ ] **Step 1: 纯函数测试 + partition 测试**

- [ ] **Step 2: 跑测失败**

- [ ] **Step 3: 实现 partition + 改 group-sections；把 `todoItems` 接入 buildRows 数据源**

- [ ] **Step 4: 跑相关侧栏/分组测试 + 新测**

Run: `pnpm test src/shared/todo/todo-requirement-worktrees.test.ts src/renderer/src/components/sidebar/worktree-list/grouping/requirement-worktree-partition.test.ts`

- [ ] **Step 5: Commit**（用户要求时）

---

### Task 7: 端到端核对与类型检查

**Files:** 无新文件；修编译/测试缺口

- [ ] **Step 1:** `pnpm tc:web` / `pnpm tc:node` 修 TodoItem fixture 遗漏  
- [ ] **Step 2:** `pnpm test` 覆盖本计划涉及路径  
- [ ] **Step 3:** 手动核对清单（写在 PR/回复里）：无工作目录字段；开始建区；详情栏；侧栏需求列表；done 后移出列表且 worktree 仍在

---

## Spec 覆盖对照

| Spec 章节 | Task |
|---|---|
| §3 自动建区 / 去 picker | 2, 3, 4 |
| §2 `boundWorktreeId` | 1 |
| §4 详情属性栏 | 5 |
| §5 侧栏需求列表 / 完结不删盘 | 6 |
| §6 错误处理 | 3, 4 |
| §7 测试 | 各 Task + 7 |
| Folder 暂不支持 | 3 |

## 自我评审备注

- 无 TBD；侧栏注入点定为 `group-sections.appendOrderedGroups` 的 repo 分支，避免改动过大。  
- `startTodoWorkspace` 与 Dialog 分离，便于单测。  
- Commit 步骤默认跳过，除非用户明确要求提交。
