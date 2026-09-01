# 开始任务：自动创建工作区 + 详情/侧栏展示

- 日期: 2026-08-28
- 状态: 待用户审阅
- 前置: 新建需求已绑定 `workspaceProjectId(s)` / `workspaceName`；开始任务已支持 ACP / 终端模式与已安装智能体过滤

---

## 0. 背景与决策

新建需求时已选择 Orca 项目（及可选工作区名称），开始任务表单里再选「工作目录」重复且误导——当前只是把项目主仓路径当 cwd，**并不会**建 worktree。

**已定决策:**

1. 开始任务时 **自动创建 worktree**，智能体在新工作区里跑。
2. 开始表单 **移除工作目录 / 项目选择器**。
3. 多项目：第一版只给 **主项目**（`workspaceProjectId`）建区；其余 `workspaceProjectIds` 仅保留绑定。
4. 未填工作区名称时，用 **需求标题** 生成安全名称（不用随机小动物名）。
5. 需求详情右侧属性栏：**每个阶段**展示工作区名称 + 项目路径。
6. 侧栏：在对应 **Orca 项目下** 增加「需求列表」分组，展示进行中需求绑定的工作区；需求完结后 **从列表移除，不删磁盘 worktree**（该工作区回到该项目下的普通 worktree 列表）。

---

## 1. 范围

### 1.1 目标

1. `EnterInProgressDialog` 去掉 `TodoWorkspaceProjectPicker`。
2. 点「开始」后：解析主项目 → `createWorktree` → 写入 `boundWorktreeId` → 激活新工作区 → 按执行模式启动智能体（ACP / 终端）。
3. 无绑定项目时：禁用开始，并提示需在需求上绑定项目。
4. 创建失败：toast，不静默改状态；对话框可重试。
5. 详情右侧属性栏：全阶段展示工作区名称、项目路径（及创建后的实际路径）。
6. 侧栏 Projects → 对应 Orca 项目下：「需求列表」子组列出未完结需求的绑定 worktree；完结后移出该组。

### 1.2 非目标

- 多项目同时建多个 worktree。
- 走完整「新建工作区」后台创建进度面板。
- 完结时删除磁盘上的 git worktree。
- 改新建需求表单的项目选择交互。
- 把需求看板本身搬进侧栏（需求列表只展示 **已创建的绑定工作区卡片**，点击切到该工作区 / 可再开需求详情）。

---

## 2. 数据模型

在 `TodoItem` 增加（schema 迁移）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `boundWorktreeId` | `string \| null` | 开始任务创建成功后写入；侧栏需求列表与详情路径解析依赖它 |

已有字段继续用：`workspaceProjectId(s)`、`workspaceName`、`prdLink`、`executionMode`、`preferredAgent`。

**完结判定:** `isTerminalTodoStatus(status)`（如 `done` / 其它终态）为真时，侧栏不再把该 worktree 放进「需求列表」。

---

## 3. 开始任务：自动建区

### 3.1 数据流

```
EnterInProgressDialog.confirm
  → resolveTodoStartWorkspace(item)   // 主项目 → repoId + name
  → createWorktree(repoId, name, setupDecision: 'skip', …)
  → updateTodoItem({ boundWorktreeId, status, executionMode, preferredAgent, templateId, … })
  → activateAndRevealWorktree(worktree.id, { startup? })
  → ACP: executeTask({ cwd: worktree.path, … })
     或 终端: 在该 worktree 上启动智能体
```

**名称:** `workspaceName?.trim()` → 否则由 `title` 生成安全名。  
**无 ready 项目 / 无 repo:** 禁用开始或 toast，不创建。  
**状态:** 仅 create 成功后再改 `in_progress` / `solution_design`。

### 3.2 UI

去掉工作目录选择器。保留执行模式、智能体、模板、提示词、AutoPilot、方案设计。创建中 loading，防连点。

---

## 4. 详情属性栏（每个阶段）

在 `TodoDetailView` 右侧 aside（状态 / 优先级 / 计划日期旁）增加只读信息：

| 展示项 | 创建前 | 创建后 |
|---|---|---|
| 工作区名称 | `workspaceName` 或「将用标题生成」的预览 / 空态文案 | 绑定 worktree 的 `displayName`（或 name） |
| 项目路径 | 主项目 ready host setup 的 path | 同上，或额外一行「工作区路径」= `worktree.path` |

要求：**todo / solution_design / in_progress / human_review / merging / done** 等凡进入详情的阶段都显示该块（无绑定时显示「未绑定项目」空态）。

可点击路径：有 worktree 时点击可 `activateAndRevealWorktree`（可选，推荐）。

---

## 5. 侧栏「需求列表」

### 5.1 位置与外观

在 Projects 树中，**对应 Orca 项目节点下**（与该项目下现有 worktree 同级区域）增加子组：

```
Projects
  …文件夹…
  <Orca 项目名>          # 与需求 workspaceProjectId 对应的项目
    需求列表             # 新分组；无活跃条目时可折叠/隐藏
      <worktree 卡片>    # 绑定未完结需求的工作区，样式贴近现有 worktree 行
    <普通 worktree…>
```

分组标题本地化：`需求列表` / `Requirements`。

### 5.2 成员规则

- 纳入：存在 `boundWorktreeId`，且对应 `TodoItem` **非终态**，且 worktree 仍存在，且归属该 Orca 项目（via repo / project 关联）。
- 完结（终态）：**仅从「需求列表」移除**；worktree 保留在磁盘，并出现在该项目 **普通 worktree 列表**（不再带需求分组标记）。
- 不删磁盘、不自动 `removeWorktree`。

### 5.3 交互

- 点击需求列表中的卡片：激活该 worktree（与点普通 worktree 一致）。
- 可选：上下文菜单「打开需求」→ `openTodoDetail(itemId)`（有则做，无则二期）。

### 5.4 实现要点（边界）

- Worktree 需可被侧栏识别为「需求绑定」：优先用 **todo 侧索引**（`boundWorktreeId` → item），不必改 worktree meta schema；完结后自然不再命中索引。
- 若同项目下多个活跃需求，列表按 `updatedAt` / `startedAt` 降序。
- 文件夹工作区（非 git）：若主项目是 folder setup，创建路径需走现有 folder workspace 创建能力；若本期只支持 git worktree，则 folder 项目开始时明确 toast「暂不支持」，写进实现计划边界。

---

## 6. 错误处理

| 情况 | 行为 |
|---|---|
| 未绑项目 | 禁用开始 + 提示 |
| createWorktree 失败 | toast；状态不变 |
| 同名冲突 | 沿用 create 错误 toast |
| bound worktree 已被用户手动删 | 详情显示「工作区已不存在」；侧栏不展示；允许再次开始重建（清空或覆盖 `boundWorktreeId`） |

---

## 7. 测试

- 名称：`workspaceName` / 标题生成。
- 开始：无项目不可开始；成功调用 createWorktree 并写入 `boundWorktreeId`。
- 详情栏：各状态下渲染名称与路径。
- 侧栏：非终态出现在需求列表；置 `done` 后离开需求列表且 worktree 仍在 store。
- 不调用删除 worktree API。

---

## 8. 文件触点（预期）

- `EnterInProgressDialog.tsx`、`todo-start-workspace.ts`、`todo-terminal-task-start.ts`
- `todo-item.ts`、todo DB schema / row mapping / repository（`bound_worktree_id`）
- `TodoDetailView.tsx` — 属性栏展示
- 侧栏 worktree 列表行构建（按 project 注入「需求列表」分组）
- i18n 五语言
- 相关测试

---

## 9. 验收

1. 开始任务无工作目录字段；点开始会建 worktree 并在该路径跑智能体。
2. 详情右侧各阶段可见工作区名称与项目/工作区路径。
3. 创建后侧栏对应 Orca 项目下出现「需求列表」条目。
4. 需求完结后条目从「需求列表」消失，磁盘 worktree 仍在，并出现在普通列表。
5. 未绑项目无法开始。
