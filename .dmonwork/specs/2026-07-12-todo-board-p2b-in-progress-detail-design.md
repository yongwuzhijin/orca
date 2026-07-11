# TODO 任务管理看板 — P2b 设计文档:In Progress 详情 + Session 对话 + cursor ACP 接入

- 阶段:P2b(In Progress 详情 UI + 进 In Progress 弹窗 + 权限交互确认 + cursor ACP 接入)
- 依赖:P1(看板骨架 + 本地持久化,已合并)、P2a(ACP 执行内核 + `acp:*` IPC/事件契约,已合并)
- 后续:P3(Human Review:内嵌 BrowserPane + 移动端模拟器 + 对话验证。直接复用本文的详情容器与对话组件)
- 日期:2026-07-12

---

## 0. 背景与定位

TODO 看板按依赖拆成 4 阶段(见 `2026-07-11-todo-board-p1-design.md` §0)。P2 = ACP 执行层 + In Progress 详情,拆成 P2a / P2b:

| 子阶段 | 范围 | 状态 |
|---|---|---|
| P2a | 主进程 ACP 执行内核 + IPC/事件契约 + 会话持久化 + 状态自动流转。不含 UI。 | 已完成 |
| **P2b(本文)** | 渲染层 In Progress 详情(Plan/进度/Session 对话)、进 In Progress 弹窗(补充提示词 + 选引擎 + 选 cwd)、权限交互确认;主进程接入 cursor ACP + 项目级默认工作目录迁移 + 权限桥接线。 | 本文设计 |

**核心定位**:P2b 是**纯渲染层集成 + 少量主进程扩展**,复用 P2a 已建好的 `acp:*` IPC/事件契约,几乎不动内核算法。P3 之后直接复用本文的详情容器(`TodoDetailView` 的 `human_review` 分区)与对话组件。

**关键决策(本次 brainstorming 已定)**:
1. **详情容器** = 全页视图。不新增 `activeView` 联合类型值(其散布数十处),保持 `activeView='todos'`,在 todos slice 加内页导航 `todoDetailItemId`,`TodoPage` 据此在"看板"与"详情全页"间切换。
2. **引擎范围** = claude + qoder + cursor,**全部走 ACP**。本期把 cursor 的原生 ACP 接上;不接 PTY-TUI 回退(P2a 预留的 `EngineFallbackNotWired` 缝保持不变)。
3. **cwd 来源** = 项目级默认 + 启动时可改。`TodoProject` 增 `defaultWorkingDir` 字段(迁移),新任务继承,启动弹窗预填、允许临时改。
4. **权限交互** = 会话级模式开关(默认 auto-allow,适合 agentic 编码)+ 切到 ask 模式时逐次弹权限卡片(允许 / 拒绝 / 总是允许)。

---

## 1. 范围(P2b)

### 1.1 目标

1. 进 In Progress 时弹启动窗:选引擎 / 选 cwd(预填项目默认)/ 补充提示词,确认后置 `in_progress` 并发起 ACP 会话。
2. In Progress 详情全页:Plan(勾选清单)/ 进度 / Session 对话(流式渲染 agent 消息、思考、tool call、plan 更新)。
3. Session 对话可交互:会话空闲时可发追加 prompt(走 resume)。
4. 权限:会话级 auto/ask 模式开关;ask 模式下对每个 `requestPermission` 弹卡片,经 `acp:resolve-permission` 应答。
5. 会话历史:列出任务历史会话 + 重放查看 + 续跑。
6. 主进程:cursor 原生 ACP 接入;`todo_projects` 加 `default_working_dir` 迁移;权限桥接真实 IPC 应答。
7. 全链路在 mock ACP agent 下可测(TDD)。

### 1.2 非目标(Out of Scope)

- Human Review 的浏览器/模拟器嵌入与对话验证(P3;本文仅在 `TodoDetailView` 留 `human_review` 占位分区)。
- PTY-TUI 回退真实接线(P2a 的 `EngineFallbackNotWired` 缝不动;三个引擎全 ACP,不触发回退)。
- P4 指标聚合看板(仅消费/展示,不聚合)。
- MCP 注入(newSession 仍传 `mcpServers: []`)。
- Assignee(个人工具,暂不做)。
- Web 模式 ACP(ACP 需 Electron 环境)。

---

## 2. 主进程扩展

### 2.1 cursor ACP 接入

已核实 Cursor ACP 契约(基于官方 CLI ACP 文档),接入分三处:

**(a) 引擎枚举 + 分流**
- `src/shared/acp/acp-session.ts`:`ACP_ENGINES = ['claude', 'qoder', 'cursor']`。`AcpEngine` 自动含 cursor;`isAcpEngine('cursor') === true`,故 `acp-execute-router.ts` **无需改动**即把 cursor 分流到 ACP。

**(b) 启动 spec(`src/main/acp/acp-agent-launcher.ts`)**
- 加 `cursorSpec()` 并入 `getAgentLaunchSpec` 的 switch。cursor 原生 ACP:二进制为 `agent`,子命令为 `acp`。即 `command = resolveCliCommand('agent')`(沿用 qoder 的 `resolveCliCommand` 模式),`args = ['acp']`,`env = {}`。
- switch 的 `default: never` 穷尽检查随枚举扩展自然覆盖 cursor。

**(c) 鉴权握手(`src/main/acp/acp-connection-pool.ts`)**
- cursor 与 claude/qoder 不同:`initialize` 之后需要一次 `authenticate({ methodId: 'cursor_login' })`,否则 `newSession` 会因未鉴权被拒。
- 在 `getAcpConnection` 的 `initialize` 之后,**按引擎条件**执行 authenticate(仅 cursor;claude/qoder 跳过,保持零回归)。`initialize` 返回的 `authMethods` 若不含 `cursor_login` 则跳过(表示已通过环境预鉴权)。
- 预鉴权兜底:允许用户提前 `agent login`,或经环境变量 `CURSOR_API_KEY` / `CURSOR_AUTH_TOKEN` 注入(spawn 时透传 `process.env`,已由 `defaultConnect` 覆盖)。authenticate 失败时以 `acp:error` 冒泡可读错误(提示先 `agent login`)。

**(d) Cursor 扩展方法(`src/main/acp/acp-client.ts` 的 `OrcaAcpClient`)**
cursor 会发送 ACP 标准之外的专有方法。**阻塞型**方法若不应答,agent 会挂起,必须在 client 侧兜底应答:
- `cursor/ask_question`(阻塞):向用户提问。P2b 暂以默认选项/空应答兜底解除阻塞(不阻断会话);UI 精细化留 P3。
- `cursor/create_plan`(阻塞):提交计划草案待确认。P2b 默认确认(auto)以解除阻塞;计划内容仍归一化进 plan 展示。
**通知型**方法(无需应答,归一化后驱动 UI):
- `cursor/update_todos` → 复用为 plan checklist 数据源(与标准 `plan` 更新合并进 `planBySession`)。
- `cursor/task` / `cursor/generate_image` → 归一化为普通 `SessionEvent` 展示(§3.1 事件映射覆盖)。

> 非 cursor 引擎不受影响:authenticate 与扩展方法分支均按引擎/方法名条件命中,claude/qoder 走原路径。

### 2.2 项目级默认工作目录迁移

`src/main/todos/todo-database.ts` 走 P1 预留的 `user_version` 事务化迁移:
- `ALTER TABLE todo_projects ADD COLUMN default_working_dir TEXT`(可空)。
- bump schema 版本;旧行 `default_working_dir = NULL` 向后兼容。
- 类型贯穿:`src/shared/todo/todo-project.ts` 的 `TodoProject` 加 `defaultWorkingDir: string | null`;`CreateTodoProjectInput` / `RenameTodoProjectInput`(或新增 `UpdateTodoProjectInput`)支持写入;`todo-row-mapping` / `todo-repository` / `ipc/todos.ts` / `preload` / slice 一致。

### 2.3 权限桥接线

`src/main/acp/acp-permission-bridge.ts`(P2a 已建默认放行 + `resolvePermission` 预留):
- 引入**会话级权限模式** `Map<sessionId, 'auto' | 'ask'>`,默认 `auto`。
- `auto`:沿用 P2a 行为,收到 `requestPermission` 立即默认放行,并仍 emit `acp:permission-request`(供 UI 记日志)。
- `ask`:收到 `requestPermission` 时挂起 Promise,emit `acp:permission-request`,等渲染层 `acp:resolve-permission { requestId, optionId }` 落定;超时(默认 120s)未决 → 默认拒绝 + 清理。
- 新增设模式的入口(session-manager 暴露 `setPermissionMode(sessionId, mode)`,经新 IPC `acp:set-permission-mode` 调用;或复用 execute 入参预置初始模式)。默认 auto,切换即时生效。
- `rejectAllForSession`(P2a 已有)在会话取消/结束时清理挂起请求。

**权限 optionId 契约**:不同引擎的 `requestPermission` 返回各自的 `options[]`(含 `optionId` / `name` / `kind`)。cursor 的 optionId 为 `allow-once` / `allow-always` / `reject-once`。**渲染层不硬编码 optionId**,而是直接渲染请求 params 里的 `options`,把用户点击映射回对应 `optionId` 经 `acp:resolve-permission` 应答(见 §4 `PermissionRequestCard`)。"总是允许"类选项(如 `allow-always`)额外把该会话切为 auto。

> 内核算法零改动,仅在权限桥内新增模式分支与挂起/应答;session-manager 仅加一个 `setPermissionMode` 转发。

### 2.4 新增/复用 IPC

| Channel | 状态 | 说明 |
|---|---|---|
| `acp:execute` / `cancel` / `list-sessions` / `load-history` | P2a 已有 | 直接复用 |
| `acp:resolve-permission` | P2a 已建缝 | P2b 接真实应答 |
| `acp:set-permission-mode` | **新增** | `{ sessionId, mode: 'auto' \| 'ask' }` → `{ ok }` |
| `todos:projects.update`(或扩 rename) | 视 P1 现状 | 写 `defaultWorkingDir` |

`preload/index.ts` + `api-types.ts` 暴露 `window.api.acp.setPermissionMode`,签名与 handler 一致。

---

## 3. 渲染层架构

### 3.1 新增 acp slice(`src/renderer/src/store/slices/acp.ts`)

独立 slice,只管"当前详情任务的会话运行态",不塞进 todos slice:

- 状态:
  - `sessionsByTask: Record<taskId, AcpSessionRecord[]>`(历史 + 当前)。
  - `activeSessionByTask: Record<taskId, sessionId | null>`。
  - `eventsBySession: Record<sessionId, SessionEvent[]>`(归一化的 agent 消息 / user 消息 / thinking / tool call / plan 更新)。
  - `planBySession: Record<sessionId, PlanEntry[]>`(ACP plan 更新最新态)。
  - `permissionRequestsBySession: Record<sessionId, PermissionRequest[]>`(pending)。
  - `permissionModeBySession: Record<sessionId, 'auto' | 'ask'>`。
  - `sessionStatusBySession: Record<sessionId, 'running' | 'complete' | 'error' | 'canceled'>`。
- 动作:`subscribeAcpEvents()`(注册 `acp:*` 监听,归一化写状态)、`executeTask(...)`、`sendFollowUp(taskId, text)`(resume)、`cancelSession(sessionId)`、`loadSessions(taskId)`、`loadHistory(sessionId)`、`setPermissionMode(sessionId, mode)`、`resolvePermission(requestId, optionId)`。
- 事件归一化:把 P2a 广播的原始 `sessionUpdate`(消息 / thinking / tool call / plan)映射为 `SessionEvent` 联合类型,渲染层只认归一化结构,便于测试与 P3 复用。cursor 专有通知(`cursor/update_todos` 合并进 plan;`cursor/task` / `cursor/generate_image` 归一化为普通事件)在同一映射层处理。

### 3.2 todos slice 扩展(`store/slices/todos.ts`)

- 加内页导航:`todoDetailItemId: string | null` + `openTodoDetail(id)` / `closeTodoDetail()`。
- `TodoProject` 类型带 `defaultWorkingDir`;必要时加 `updateTodoProject` 动作写默认目录。

### 3.3 页面接线

- `TodoPage.tsx`:当 `todoDetailItemId` 非空 → 渲染 `<TodoDetailView itemId=... />`,否则渲染看板。返回按钮调 `closeTodoDetail()`。
- `App.tsx` 无需改(仍 `activeView === 'todos' ? <TodoPage/> : null`)。
- 卡片/看板打开详情:由现有打开 `TodoDetailDialog` 的入口改为 `openTodoDetail(id)`。

---

## 4. 组件拆分(`src/renderer/src/components/todo/detail/`)

按职责拆分,避免大文件(遵守 max-lines ratchet):

- `TodoDetailView.tsx`:全页容器。header(identifier / title / `TodoStatusMenu` / 返回看板 / error·outcome 提示条)。**按 `item.status` 分区**:
  - 非执行态(backlog/todo/rework/merging/done/canceled/duplicate):平移现有 `TodoDetailDialog` 的 Markdown 预览 + 侧栏(状态/优先级/排期)。原 `TodoDetailDialog` 内容抽为可复用子块或直接迁入。
  - `in_progress` → `<InProgressPanel />`。
  - `human_review` → **P3 占位分区**(一句"P3 待接入"占位;P3 往此处塞 BrowserPane/EmulatorPane + 复用对话组件)。
- `InProgressPanel.tsx`:三区布局 `Plan | 进度 | Session 对话`。挂载时 `loadSessions(taskId)`;无活跃会话时展示"发起会话"入口。
- `SessionConversation.tsx`:渲染 `eventsBySession[activeSession]` + 底部输入框(空闲可发追加 prompt → `sendFollowUp`);顶部权限模式开关(auto/ask,调 `setPermissionMode`)+ cancel 按钮。
- `session-event-item.tsx`:单条事件渲染(agent 消息 / user 消息 / thinking 折叠 / tool call 折叠含入参出参 / plan 更新徽标)。
- `PlanChecklist.tsx`:`planBySession` 渲染为勾选清单(ACP plan 状态映射到 ☐/☑/进行中)。
- `PermissionRequestCard.tsx`:ask 模式下每个 pending 请求一张卡片。**按请求 params 的 `options[]` 动态渲染按钮**(不硬编码 optionId),点击 → `resolvePermission(requestId, optionId)`;命中"总是允许"类选项(如 cursor 的 `allow-always`)额外切该会话为 auto。
- `EnterInProgressDialog.tsx`:见 §5。
- `session-event-mapping.ts`:原始 sessionUpdate → `SessionEvent` 的纯函数(单测友好)。

对话面板**可交互**:会话进行中禁用发送(P2a 并发锁),空闲/完成后可发追加 prompt(`acp:execute` 带 `resumeSessionId`,命中 P2a resume 逻辑)。

---

## 5. 进 In Progress 弹窗(`EnterInProgressDialog.tsx`)

**触发**:`TodoStatusMenu` 或详情里把状态改为 `in_progress` 时,拦截并先弹此窗(不直接改状态)。

**字段**:
- 引擎:claude / qoder / cursor(单选,全 ACP)。默认取上次所选或引擎首个。
- 工作目录 cwd:预填 `project.defaultWorkingDir`;可改(复用现有 directory-browser 选择器)。为空时提示必选。
- 提示词:基础 prompt 自动由 `任务标题 + 描述(Markdown)` 组成(展示为只读预览);下方"补充提示词"可选输入,追加到基础 prompt 尾部。

**确认流程**:
1. `updateTodoItem(id, { status: 'in_progress' })`(P2a 会写 started_at)。
2. `window.api.acp.execute({ taskId, engine, prompt, cwd })` → 得 `{ sessionId }`。
3. `openTodoDetail(id)` 跳详情 In Progress 面板;acp slice 已订阅 `acp:*`,开始流式渲染。

**取消**:关闭弹窗不改状态、不发起会话。

---

## 6. 数据流与状态自动流转

- execute → `acp:session-ready` → `acp:update:{sid}`(流式) → `acp:complete` / `acp:error`。acp slice 订阅归一化入内存态,`SessionConversation` 实时渲染。
- 正常完成:P2a 已自动 `in_progress → human_review`。渲染层收到 task 更新(经 todos 刷新/事件)后,详情 header 状态更新,用户可进 Human Review(P3)。
- error / canceled:P2a 不改状态;`acp:task-outcome` → 详情 header 显示 outcome 提示 + 重试入口(重试 = 再发 execute,可 resume)。
- 会话历史:`acp:list-sessions` 列历史;选中历史会话 `acp:load-history` 重放到对话面板(查看/续跑)。

---

## 7. 错误处理与边界

- 引擎未安装 / spawn 失败 / cursor `agent acp` 命令解析失败:`acp:error` → 面板可读错误 + 重试。
- cursor 未鉴权(authenticate 失败或无凭证):`acp:error` 冒泡可读提示(先 `agent login` 或设 `CURSOR_API_KEY` / `CURSOR_AUTH_TOKEN`)。
- 详情打开时 item 被删/切项目:`todoDetailItemId` 指向不存在 → 自动 `closeTodoDetail()` 回看板。
- 权限 ask 超时:120s 未决默认拒绝 + 清卡片(§2.3);auto 模式无超时。
- 同 session 并发 prompt:P2a 锁已拒绝;UI 在会话运行中禁用发送,避免触发。
- cwd 为空:弹窗禁用确认并提示。

---

## 8. 测试(TDD)

**主进程**:
- `acp-agent-launcher`:`cursorSpec` 生成(`command='agent'` / `args=['acp']`)+ mock 模式;`getAgentLaunchSpec('cursor')`。
- `acp-execute-router`:`'cursor'` 走 ACP(不再抛 `EngineFallbackNotWired`);未知引擎仍抛。
- `acp-connection-pool` 鉴权:cursor 在 `initialize` 后触发 `authenticate({ methodId:'cursor_login' })`;`authMethods` 不含 `cursor_login` 时跳过;claude/qoder **不触发** authenticate(零回归);authenticate 失败冒泡 `acp:error`。
- `acp-client`(OrcaAcpClient)cursor 扩展方法:阻塞型 `cursor/ask_question` / `cursor/create_plan` 必定应答(不挂起);通知型 `cursor/update_todos` 归一化进 plan、`cursor/task` / `cursor/generate_image` 归一化为事件。
- `todo-database` 迁移:`default_working_dir` 向后兼容(旧行 NULL);repo/mapping 读写。
- 权限桥:auto 立即放行 + emit;ask 挂起 → resolve 放行/拒绝;ask 超时默认拒绝;`setPermissionMode` 切换。

**渲染层(vitest + RTL)**:
- `session-event-mapping`:各类 sessionUpdate → `SessionEvent` 归一化。
- acp slice:订阅 `acp:*` 的 reducer(update/complete/error/permission-request → 状态)、`sendFollowUp` resume 调用、`resolvePermission` / `setPermissionMode` IPC 调用。
- `EnterInProgressDialog`:组 prompt(标题+描述+补充)、cwd 预填与必选校验、confirm 调 updateTodoItem + execute + openTodoDetail。
- `SessionConversation`:渲染各类事件、运行中禁用发送、空闲可发追加。
- `PermissionRequestCard`:三种操作 → 正确 optionId / 模式切换。
- `TodoDetailView`:按 status 分区渲染;`human_review` 显占位;item 消失回退看板。
- todos slice:`openTodoDetail/closeTodoDetail`;`TodoProject.defaultWorkingDir` 贯穿。

遵循 P1/P2a 一致的类型贯穿检查(shared → repo → ipc → preload → 事件 → slice)。

---

## 9. 后续衔接预留点(P3)

- `TodoDetailView` 的 `human_review` 分区:P3 往此嵌入现有 `components/browser-pane/BrowserPane.tsx` + `components/emulator-pane/EmulatorPane.tsx`,复用本文 `SessionConversation` 做"对话验证"。
- `agent-browser-bridge.ts`(已有):P3 让引擎驱动浏览器做自动化验证时复用。
- 权限模式与对话组件在 P3 原样复用,无需重构。
