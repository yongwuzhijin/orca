# TODO 任务管理看板 — P2a 设计文档:ACP 执行内核(主进程)

- 阶段:P2a（ACP 执行内核，主进程；不含 UI）
- 依赖:P1（看板骨架 + 本地持久化，已完成并合并到 main）
- 后续:P2b（In Progress 详情 UI，基于本文定义的 IPC/事件契约）
- 日期:2026-07-11

---

## 0. 背景与定位

TODO 看板功能按依赖拆成 4 个阶段(见 `2026-07-11-todo-board-p1-design.md` §0)。P2 = ACP 执行层 + In Progress 详情,进一步拆成:

| 子阶段 | 范围 | 依赖 |
|---|---|---|
| **P2a(本文)** | 主进程 ACP 执行内核 + IPC/事件契约 + 会话持久化 + 任务状态自动流转。不含任何 UI。 | P1 |
| P2b | In Progress 详情 UI(Plan 预览 / 进度 / Session 对话)、进 In Progress 弹窗(补充提示词 + 选引擎 + 选 cwd)、权限交互确认。 | P2a |

**ACP(Agent Client Protocol)**:由 `@agentclientprotocol/sdk` 定义的 Client ↔ Agent 标准协议,基于 stdio 的 NDJSON 双向流。Electron 主进程作为 **Client**,AI 编码引擎作为 **Agent 子进程**运行。参考实现见 `dmon-work-electron/docs/acp-claude-qoder.md`,本设计将其分层架构移植到 orca 约定。

**现状(orca)**:全仓无 ACP 代码,P2a 为绿地开发。现有引擎均走 PTY-TUI(`src/shared/types.ts` 的 `TuiAgent` 联合类型 + `src/shared/tui-agent-config.ts`);`cursor` 已是成员,`qoder` 尚无。

---

## 1. 范围(P2a)

### 1.1 目标

1. 通过 IPC 对一个 TODO 任务发起 ACP 会话,把任务的提示词交给引擎执行。
2. 流式接收引擎的 `sessionUpdate`(消息 / 思考 / tool call / plan)并广播到渲染层。
3. 会话正常完成后,任务自动 `in_progress → human_review`;失败/取消打标记 + 发事件,不自动改状态。
4. 会话落库(历史 + 当前活跃指针),支持 cancel、列出任务的会话历史、加载历史重放。
5. mock ACP agent 下全链路可测(TDD)。

### 1.2 首批引擎

- **claude**:`process.execPath` + `claude-agent-acp/dist/index.js`(`ELECTRON_RUN_AS_NODE=1`,`CLAUDE_CODE_EXECUTABLE` 指向 claude 二进制)。
- **qoder**:`findBinary('qoder')` + `['--acp']` 原生 ACP。
- 架构对"加一个引擎"友好:新增引擎 = 加一条 launch spec + 一个 `AcpEngine` 枚举项,无需改动内核其它部分。

### 1.3 非目标(Out of Scope,留待后续)

- cursor 的 ACP 接线与真机联调(架构预留,P2a 不接)。
- 非 ACP 引擎回退 PTY-TUI 的真实接线(仅保留 `executeRouter` 分流缝,命中即抛"未接线")。
- 全部 In Progress UI、进 In Progress 弹窗、权限交互确认弹窗、mode/model 选择器(P2b)。
- MCP 注入(`newSession` 传 `mcpServers: []`)。
- Web 模式 ACP(ACP 需要 Electron 环境)。
- P4 指标聚合(P2a 只攒会话数据,不做聚合看板)。

---

## 2. 架构与模块

新建目录 `src/main/acp/`,移植参考实现的分层:

| 模块 | 职责 |
|---|---|
| `acp-agent-launcher.ts` | `getAgentLaunchSpec(engine)` → `{ command, args, env }`。支持 claude / qoder / mock(`DMON_ACP_MOCK=1`)。`isMockMode()`。 |
| `acp-connection-pool.ts` | 每引擎单例长连接 `Map<AcpEngine, AcpConnectionEntry>`;`OrcaAcpClient` 实现 Client 侧能力(fs / terminal / permission);`getAcpConnection` / `closeAcpConnection`;`sessionUpdate` 事件缓存(上限 3000 条)+ `replaySessionEvents`;Agent 进程 exit → 清理该引擎全部 streaming session。 |
| `acp-session-manager.ts` | 会话生命周期:`startPrompt` / `runPrompt`(异步不阻塞) / `cancelSession` / `listSessions(taskId)` / `loadHistory(sessionId)`;`activePrompts` 并发锁(同 session 禁止并发 prompt);向渲染层发 ready / update / complete / error;终态回调触发状态自动流转(§4)与会话落库(§3)。 |
| `acp-permission-bridge.ts` | Agent `requestPermission` ↔ 渲染层;P2a 默认放行(§6);导出 `resolvePermission`(为 P2b 预留)、`rejectAllForSession`。 |
| `acp-execute-router.ts` | 统一入口 `executeEnginePrompt(opts)`:claude / qoder → ACP;其它引擎 → 预留 PTY 回退缝(P2a 命中即抛 `EngineFallbackNotWired`)。 |
| `acp-types.ts` | `AcpEngine`(`'claude' \| 'qoder'`,后续扩)、`AcpSessionMeta`、`StartPromptOptions`、`AcpSessionUpdateKind` 等本地类型。 |

### 2.1 连接与会话生命周期

```
getAcpConnection(engine)
  → getAgentLaunchSpec(engine) → spawn(command, args, { stdio: ['pipe','pipe','pipe'] })
  → ndJsonStream(stdin, stdout)
  → new ClientSideConnection((_agent) => new OrcaAcpClient(engine), stream)
  → connection.initialize({ protocolVersion, clientCapabilities: { fs, terminal }, clientInfo })

startPrompt({ taskId, engine, prompt, cwd, resumeSessionId? })
  1. 并发锁 activePrompts 防同 session 并发
  2. resumeSessionId 存在 → resumeSession(失败回退 loadSession);否则 newSession({ cwd, mcpServers: [] })
  3. 落库 acp_sessions(status=running, cwd) + 更新 todo_items.session_id;任务写 started_at
  4. 设许可型 mode(§6)
  5. emit 'acp:session-ready' { sessionId, modes, models }
  6. 异步 runPrompt(不阻塞);invoke 立即返回 { sessionId }

runPrompt: connection.prompt({ sessionId, prompt: [{ type:'text', text }] })
  - 流式:sessionUpdate → 缓存 → emit 'acp:update:{sessionId}'
  - 完成:{ stopReason } → 状态流转(§4)+ 落库(ended_at/stop_reason)+ emit 'acp:complete'
  - 错误:catch → 落库 status=error + emit 'acp:error' + 'acp:task-outcome'

cancelSession(sessionId): rejectAllForSession → connection.cancel({ sessionId }) → 等 in-flight → 落库 status=canceled + emit 'acp:task-outcome'
```

### 2.2 领域耦合边界

内核对 todo 领域的耦合只有两处,均经注入的 repository(不反向依赖 UI):
- **启动时**:读任务(取标题/描述用于组 prompt 的部分由调用方 P2b 传入;P2a 只接收最终 `prompt` 字符串)。
- **终态时**:写任务状态 / 时间戳 / `session_id`,写 `acp_sessions`。

---

## 3. 持久化

### 3.1 独立库 `acp-sessions.db`

沿用 orca 的「DB 类 + Repository」模式(参考 `src/main/todos/todo-database.ts`),执行域与任务域解耦:
- `src/main/acp/acp-session-database.ts`:schema + `user_version` 迁移骨架。
- `src/main/acp/acp-session-repository.ts`:CRUD。
- `src/main/acp/acp-session-row-mapping.ts`:行 ↔ 领域对象映射。

**表 `acp_sessions`**:

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | orca 侧会话记录 id |
| `task_id` | TEXT | 关联 TODO 任务(索引) |
| `engine` | TEXT | `'claude' \| 'qoder'` |
| `session_id` | TEXT | 引擎侧 ACP sessionId |
| `cwd` | TEXT | 执行工作目录 |
| `status` | TEXT | `running \| completed \| error \| canceled` |
| `stop_reason` | TEXT NULL | 引擎返回的 stopReason / 错误摘要 |
| `started_at` | TEXT | 起始时间 |
| `ended_at` | TEXT NULL | 结束时间 |
| `created_at` | TEXT | 创建时间 |

索引:`idx_acp_sessions_task_id (task_id)`。

领域类型(新增 `src/shared/acp/acp-session.ts`):`AcpSessionRecord`、`AcpSessionStatus`。

### 3.2 todo 库迁移:加 `session_id`

`src/main/todos/todo-database.ts` 走 P1 预留的 `user_version` 事务化 ALTER:
- `ALTER TABLE todo_items ADD COLUMN session_id TEXT`(指向"当前活跃会话",可空)。
- bump schema 版本;`TodoItem` 类型加 `sessionId: string | null`(shared → repo → mapping → ipc → preload → slice 一致,P2b 消费)。
- 迁移向后兼容:旧行 `session_id = NULL`。

---

## 4. 状态自动流转

会话终态回调统一处理(§Q4 决策 = 只自动走 happy path):

| 会话结果 | 任务状态动作 | 其它 |
|---|---|---|
| 正常完成(stopReason 非错误) | 若任务仍 `in_progress` → 置 `human_review` | 视需要写 `completed_at`(进入终态阶段) |
| error | **不改状态** | `acp_sessions.status=error` + emit `acp:task-outcome`{taskId, result:'error'} |
| canceled | **不改状态** | `acp_sessions.status=canceled` + emit `acp:task-outcome`{taskId, result:'canceled'} |

任务进入 `in_progress`(execute 发起)时写 `started_at`(P1 已预留)。状态映射集中在 session-manager 一处,便于将来调整。

---

## 5. IPC 与事件契约

### 5.1 IPC(新建 `src/main/ipc/acp.ts` → `registerAcpHandlers(deps)`)

在 `src/main/ipc/register-core-handlers.ts` 按现有模式 import + 调用;依赖经 runtime getter 注入(`runtime.getAcpSessionRepository()`、`runtime.getTodoRepository()`)。

| Channel | 入参 | 返回 | 说明 |
|---|---|---|---|
| `acp:execute` | `{ taskId, engine, prompt, cwd, resumeSessionId? }` | `{ sessionId }` | 新建/恢复会话并异步 prompt |
| `acp:cancel` | `{ sessionId }` | `{ ok }` | 取消会话 |
| `acp:resolve-permission` | `{ requestId, optionId }` | `{ ok }` | P2b 预留;P2a 默认放行 |
| `acp:list-sessions` | `{ taskId }` | `AcpSessionRecord[]` | 任务会话历史 |
| `acp:load-history` | `{ sessionId }` | `void`(历史经事件重放) | 加载并重放历史 |

### 5.2 preload

`src/preload/index.ts` 暴露 `window.api.acp = { execute, cancel, resolvePermission, listSessions, loadHistory }`;签名进 `src/preload/api-types.ts`,与主进程 handler 一致。

### 5.3 渲染层事件(经现有 emitToRenderer 广播)

| 事件 | payload |
|---|---|
| `acp:session-ready` / `:{sessionId}` | `{ sessionId, modes, models }` |
| `acp:update` / `:{sessionId}` | `SessionNotification`(原始 sessionUpdate) |
| `acp:complete` / `:{sessionId}` | `{ sessionId, stopReason }` |
| `acp:error` / `:{sessionId}` | `{ sessionId, message }` |
| `acp:permission-request` / `:{sessionId}` | `{ requestId, sessionId, params }` |
| `acp:task-outcome` / `:{taskId}` | `{ taskId, sessionId, result: 'error' \| 'canceled' }` |

命名采用 orca 风格 `acp:*` 前缀(非参考实现的 `{engine}-acp-*`);引擎信息在 payload 里区分。

---

## 6. 权限处理

§Q6 决策 = 默认宽松模式跑通 + 留交互契约:
- 新建会话默认设许可型 mode(claude 用 `bypassPermissions` / `acceptEdits`,按 `session-ready` 返回的 `modes` 能力探测选择;不支持则跳过)。
- `acp-permission-bridge` 收到 Agent `requestPermission` 时:P2a **默认放行**并 emit `acp:permission-request`(供 P2b 将来做交互确认 / mode 切换)。
- `resolve-permission` IPC 已建,P2a 内部走默认放行;P2b 接入后由 UI 决定,内核零改动。

**安全说明**:这些是用户明确发起的 agentic 编码任务,执行域为其指定 `cwd`;默认放行是有意的产品选择,交互式细粒度控制留 P2b。

---

## 7. 测试(TDD)

- **Mock ACP agent**:`tests/` 下 `mock-acp-agent.mjs`(SDK `AgentSideConnection` + `ndJsonStream`),实现 `initialize`/`newSession`/`resumeSession`/`loadSession`/`listSessions`/`prompt`/`cancel`;特殊 prompt `SLOW_TEST`(可测 cancel)、`PERMISSION_TEST`(触发 requestPermission)。`DMON_ACP_MOCK=1` 时 launcher spawn mock。
- **单元测试**(vitest,scoped `src/main/acp` + `src/main/todos`):
  - `acp-agent-launcher`:各引擎 spec 生成 + mock 模式。
  - `acp-session-manager`:new / resume / cancel / 并发锁拒绝 / 终态状态流转映射 / 落库。
  - `acp-session-repository` + 迁移:CRUD、todo `session_id` 迁移向后兼容。
  - `acp-execute-router`:claude/qoder 走 ACP、其它引擎抛 `EngineFallbackNotWired`。
  - 权限:默认放行 + 事件透传。
- 遵循 P1 一致的类型贯穿检查(shared → repo → ipc → preload → 事件)。

---

## 8. 错误处理与边界

- **Agent 进程 crash**:该引擎全部 streaming session 标记 error + emit;连接清理,下次 execute 重新 spawn。
- **同 session 并发 prompt**:`activePrompts` 锁,第二次抛 `Session already has a prompt in flight`。
- **resume 失败**:回退 `loadSession`;再失败则作为 error 落库 + 事件。
- **未知/非 ACP 引擎**:router 抛 `EngineFallbackNotWired`(P2a 明确不接线,非静默失败)。
- **权限超时**:P2a 默认放行,无 120s 超时问题;P2b 引入交互后再定超时策略。

---

## 9. 后续衔接预留点

- **P2b**:消费 `acp:*` 事件与 `window.api.acp.*`;进 In Progress 弹窗提供 `cwd` 选择器 + 提示词补充 + 引擎选择;权限交互确认;Plan/进度/对话 UI。
- **cursor / PTY 回退**:加 launch spec + 枚举项 / 接线 router 回退分支。
- **P4**:基于 `acp_sessions` 历史聚合指标(会话轮次、时长等);必要时加指标列或独立指标表。
