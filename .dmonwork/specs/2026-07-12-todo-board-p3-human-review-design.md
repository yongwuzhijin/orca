# TODO 任务管理看板 — P3 设计文档:Human Review(预览 + 验证 + 决策)

- 阶段:P3(Human Review:内嵌轻量预览浏览器 + 响应式视口切换 + 对话验证 + 决策流转)
- 依赖:P1(看板骨架 + 本地持久化,已合并)、P2a(ACP 执行内核 + `acp:*` IPC/事件契约,已合并)、P2b(In Progress 详情 UI + Session 对话 + cursor ACP,已合并)
- 后续:P4(真实 git 合并 + Done 数据看板)
- 日期:2026-07-12

---

## 0. 背景与定位

TODO 看板按依赖拆成 4 阶段(见 `2026-07-11-todo-board-p1-design.md` §0)。P3 = Human Review:把 `TodoDetailView` 中 `human_review` 状态的占位分区,做成一个可用的评审工作台。

**核心定位**:**预览运行结果 → 对话验证 → 决策(通过/打回)**,浏览器为中心。P3 是**纯渲染层集成 + 一个瘦主进程 IPC**,复用 P2a/P2b 已建好的 ACP 会话与端口扫描能力,不动内核算法。

**核心约束(P3 要解决的关键问题)**:一个 TODO 任务只在一个 **cwd** 里跑 ACP,**没有 Orca 的 worktreeId**。因此 P3 **不能**复用 worktree 绑定的 `BrowserPane`(226KB,需要 `browserTab: BrowserWorkspaceState` 绑 worktreeId)与 `EmulatorPane`(需要 worktreeId)。改用**基于路径的端口归属**:用任务 cwd 构造一个 `WorkspacePortProbe`,复用已有端口扫描器探测 dev-server URL,再渲染一个裸 `<webview>` 指向它。

**关键决策(本次 brainstorming 已定)**:
1. **Human Review 定位** = 预览 + 验证 + 决策(浏览器为中心)。
2. **预览目标 URL** = 从任务 cwd 自动探测 dev server(基于路径的端口归属),零命中时允许手动填 URL。
3. **移动端** = 响应式视口切换(约束 webview 宽度 + 可选移动 UA),**不做设备模拟器**(不引入 EmulatorPane)。
4. **决策语义** = 通过 → `merging`;打回 → `rework`。P3 只做**状态流转**,不接真实 git(P4 再接)。
5. **内嵌方式** = 新建轻量 `ReviewBrowserPane`(方案 A),**不复用** worktree 耦合的 `BrowserPane`。

---

## 1. 范围(P3)

### 1.1 目标

1. `TodoDetailView` 的 `human_review` 分区替换为可用的 `HumanReviewPanel`。
2. 内嵌轻量预览浏览器 `ReviewBrowserPane`:挂载时按任务 cwd 自动探测 dev-server URL 并加载;极简工具栏(URL 显示/编辑、reload、后退/前进、桌面/移动视口切换)。
3. 响应式视口切换:桌面(撑满)/ 移动(约束宽度 + 移动 UA 覆盖)。
4. 验证侧:复用 P2b 的 `SessionConversation`(看完整对话 + 空闲时发追加 prompt 走 resume)与 `PlanChecklist`。
5. 决策条:通过 → `merging`;打回 → `rework`(可选带打回说明)。
6. 主进程:新增瘦 IPC `todos:review.scanPorts`,按任务 cwd 复用已有 `scanWorkspacePortProbes` 探测端口。
7. 全链路可测(TDD)。

### 1.2 非目标(Out of Scope)

- 复用 worktree 耦合的 `BrowserPane` / `EmulatorPane`(它们需要 worktreeId;任务只有 cwd)。
- 真实 git 合并(P4;P3 只把状态推到 `merging`)。
- 原生移动端设备模拟器(EmulatorPane)。
- 任何 ACP 内核改动(复用 P2a/P2b 的 execute + resume)。
- P4 指标聚合看板。

---

## 2. 主进程扩展

### 2.1 新增瘦 IPC:按 cwd 扫描端口

**问题**:现有 `workspacePorts:scan`(`src/main/ipc/workspace-ports.ts`)只扫描**已注册的 worktree**——它通过 `getStoreWorkspacePortProbes(store, repoId)` 从 `store.getRepos()` + `store.getAllWorktreeMeta()` 构造 probe。TODO 任务没有 worktreeId,只有 cwd,命不中。

**方案**:新增瘦 IPC,直接用任务 cwd 构造即席 probe,复用已有 `scanWorkspacePortProbes`。

| Channel | 状态 | 说明 |
|---|---|---|
| `todos:review.scanPorts` | **新增** | 入参 `{ taskId }` → 出参 `WorkspacePort[]` |

handler 逻辑:
1. 从 acp session 库取该任务**最新会话**的 `cwd`(`AcpSessionRecord.cwd`,已持久化,无需新增字段)。
2. 构造 `WorkspacePortProbe = { id: taskId, repoId: taskId, displayName: <task title 或 taskId>, path: cwd }`。
3. 调 `scanWorkspacePortProbes([probe])`(`src/main/ports/workspace-port-ownership.ts`,已有,接受即席 probe)。
4. 返回命中的 `WorkspacePort[]`。任务无会话 / 无 cwd → 返回空数组(不抛)。

**URL 选取(渲染层)**:优先 `WorkspacePort.advertisedUrl`;否则用 `http://{connectHost}:{port}`(protocol 为 `https` 时用 `https://`)兜底。

> 内核零改动:不碰 acp、不碰 worktree store,只加一个"读 cwd + 调已有扫描器"的转发。

### 2.2 preload / api-types 暴露

`preload/index.ts` + `api-types.ts` 暴露:
```ts
window.api.todos.review.scanPorts(input: { taskId: string }): Promise<WorkspacePort[]>
```
签名与 handler 一致。`WorkspacePort` 复用 `src/shared/workspace-ports.ts` 已有类型。

### 2.3 状态流转(复用,不新增 IPC)

Approve / Reject 只是状态变更,复用 P1 已有的 `updateTodoItem(id, { status })`:
- Approve → `updateTodoItem(id, { status: 'merging' })`
- Reject → `updateTodoItem(id, { status: 'rework' })`

`rework` 态下用户可再次进入执行(复用 P2b 的 execute + resume 路径),P3 不新增逻辑。

---

## 3. 渲染层架构与组件拆分

新增组件都放在 `src/renderer/src/components/todo/detail/`,遵守 max-lines ratchet(拆小、单一职责)。

### 3.1 `ReviewBrowserPane.tsx`(预览侧,轻量)

裸 `<webview>`,不依赖 worktree。参照 `src/renderer/src/components/browser-pane/browser-page-webview.ts` 的创建模式:
- `document.createElement('webview')` + `setAttribute('partition', <每任务独立分区>)` + `allowpopups` + `webpreferences = ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE`(来自 `shared/browser-guest-web-preferences`)。
- 分区用 `review:{taskId}`,保证任务间会话隔离。
- 顶部极简工具栏:URL 显示/编辑、reload、后退/前进、**桌面/移动视口切换**。
- 挂载时调 `window.api.todos.review.scanPorts({ taskId })` 自动探测:命中单端口自动填 URL;命中多端口给下拉选;零命中显示"未探测到 dev server + 手动填 URL"入口。

**响应式视口切换**(替代模拟器):
- 桌面:webview 撑满容器。
- 移动:约束 webview 宽度(如 390px)居中 + 注入移动端 UA(通过 webview 的 `useragent` 属性或 `setUserAgent`)。纯 CSS 宽度约束 + UA 覆盖,不引入 EmulatorPane。

### 3.2 `HumanReviewPanel.tsx`(容器,组合布局)

三块布局:**预览 | 验证对话 | 决策条**。
- 预览:`<ReviewBrowserPane taskId={item.id} />`。
- 验证:复用 P2b 的 `<SessionConversation />`(看完整对话 + 空闲时发追加 prompt 走 resume)+ `<PlanChecklist />`。数据源仍是 acp slice 的 `sessionsByTask[taskId]` / `eventsBySession`。挂载时 `loadSessions(taskId)`。
- 决策:`<ReviewDecisionBar item={item} />`。

### 3.3 `ReviewDecisionBar.tsx`(决策条)

两个主操作:
- **通过(Approve)** → `updateTodoItem(item.id, { status: 'merging' })`。
- **打回(Reject)** → `updateTodoItem(item.id, { status: 'rework' })`。

Reject 可选带一句打回说明(P3 先做最简:可选说明输入框;说明作为下次 resume 的补充 prompt 或追加到任务描述)。

### 3.4 接线 `TodoDetailView.tsx`

把现有 `human_review` 占位分区:
```tsx
) : item.status === 'human_review' ? (
  <div className="...">Human Review — coming in P3</div>
) : (
```
替换为:
```tsx
) : item.status === 'human_review' ? (
  <HumanReviewPanel item={item} />
) : (
```

### 3.5 slice 改动(极小)

- todos slice:无新增(复用 `updateTodoItem`)。
- acp slice:无新增(复用 `loadSessions` / `sessionsByTask` / `sendFollowUp`)。
- 仅新增瘦 IPC 的 preload 封装(§2.2)。

---

## 4. 数据流

1. 用户进入 `human_review` 态任务详情 → `HumanReviewPanel` 挂载。
2. `ReviewBrowserPane` 调 `scanPorts({ taskId })` → 主进程取最新会话 cwd → `scanWorkspacePortProbes([probe])` → 返回 `WorkspacePort[]`。
3. 渲染层选 URL(优先 `advertisedUrl`)→ `<webview>` 加载 → 用户在预览里点看。
4. 验证侧 `loadSessions(taskId)` → `SessionConversation` 展示完整对话;空闲时可发追加 prompt(resume)复现/追问。
5. 用户点决策:通过 → `updateTodoItem(id,{status:'merging'})`;打回 → `updateTodoItem(id,{status:'rework'})`。
6. 状态变更经 todos slice 落库(P1 持久化),详情/看板同步。

---

## 5. 错误处理与边界

- 端口零命中:显示"未探测到 dev server",提供手动填 URL 输入框。
- 任务无会话 / 无 cwd:`scanPorts` 返回空数组;面板提示"该任务尚无运行会话"。
- webview 加载失败(URL 不可达):webview `did-fail-load` → 面板显示可读错误 + 重试/改 URL。
- item 被删 / 切项目:沿用 `TodoDetailView` 已有逻辑,`todoDetailItemId` 指向不存在 → 自动 `closeTodoDetail()` 回看板。
- SSH 场景:`advertisedUrl` 已由上游 `ssh-advertised-url-enrichment.ts` 处理富化;P3 直接消费,不额外处理。

---

## 6. 测试(TDD)

**主进程:**
- `todos:review.scanPorts` handler:
  - 任务有会话 → 取最新 `AcpSessionRecord.cwd` 构造 probe → 调 `scanWorkspacePortProbes` → 返回 `WorkspacePort[]`。
  - 任务无会话 / 无 cwd → 返回空数组(不抛)。
  - probe 的 `path` 等于会话 cwd(断言构造正确)。

**渲染层(vitest + RTL):**
- `ReviewBrowserPane`:
  - 挂载调 `scanPorts`;命中单端口自动填 URL;命中多端口给下拉;零命中显示手动填 URL 入口。
  - URL 选取:优先 `advertisedUrl`,否则 `http://{connectHost}:{port}`。
  - 桌面/移动切换:移动态约束宽度 + UA 覆盖。
- `ReviewDecisionBar`:Approve → `updateTodoItem(id,{status:'merging'})`;Reject → `updateTodoItem(id,{status:'rework'})`。
- `HumanReviewPanel`:渲染预览 + `SessionConversation` + `PlanChecklist` + 决策条;挂载 `loadSessions(taskId)`。
- `TodoDetailView`:`human_review` 态渲染 `HumanReviewPanel`(不再是占位文案)。

> `<webview>` 在 jsdom 下无法真正渲染,测试用 mock/stub `window.api.todos.review.scanPorts` + 断言 DOM 属性(partition / src / 宽度),不测真实加载。

---

## 7. i18n 与验证门

**i18n**:所有可见文案走 `translate('auto.components.todo.detail.<Component>.<key>', 'fallback')`,完成后跑 `pnpm run sync:localization-catalog`。

**验证门(声称完成前必跑)**:
1. `pnpm typecheck`
2. `pnpm lint`(含 max-lines-ratchet — 组件拆小别触线)
3. `npx vitest run --config config/vitest.config.ts`
4. UI 手验:进一个 `human_review` 任务 → 预览自动探测 URL → 桌面/移动切换 → Approve/Reject 状态流转正确。

---

## 8. 文件清单

**主进程:**
- 修改 `src/main/ipc/todos.ts`(或就近):注册 `todos:review.scanPorts` handler。
- 修改 `preload/index.ts` + `api-types.ts`:暴露 `window.api.todos.review.scanPorts`。
- 复用(不改):`src/main/ports/workspace-port-ownership.ts` 的 `scanWorkspacePortProbes`;`src/main/acp/acp-session-database.ts` 读 cwd。

**渲染层(全部在 `src/renderer/src/components/todo/detail/`):**
- 新建 `ReviewBrowserPane.tsx`
- 新建 `HumanReviewPanel.tsx`
- 新建 `ReviewDecisionBar.tsx`
- 修改 `TodoDetailView.tsx`:`human_review` 分区接 `HumanReviewPanel`
- 复用(不改):`SessionConversation.tsx`、`PlanChecklist.tsx`

**测试:** 对应 `*.test.ts(x)`(渲染层组件)与主进程 handler 测试。

---

## 9. P4 衔接预留

- `merging` 态:P4 接真实 git 合并 / Done 数据看板;P3 只把状态推到 `merging`。
- `ReviewBrowserPane` 的端口探测 + 视口切换在 P4 可原样复用。
- 打回说明(§3.3)在 P4/后续可作为 rework resume 的结构化输入。
