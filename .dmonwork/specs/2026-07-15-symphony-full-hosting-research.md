# orca 待办看板 → 需求全托管：对标 Symphony 的调研与借鉴

- **日期**：2026-07-15
- **状态**：调研 / 分析（Research，非设计 spec）—— 用于为「需求全托管」下一阶段设计提供输入
- **对标对象**：OpenAI Symphony（`~/Downloads/symphony-main 2/SPEC.md`，Draft v1，language-agnostic）
- **目标**：让引擎自己把需求/任务推进到尽可能完整的状态——即在 orca 现有 Harness 之上长出「需求全托管」能力
- **关联**：`2026-07-11-todo-board-p1-design.md` 起的 P1–P4b 系列（TODO 看板四阶段已收官）

---

## 1. 背景

orca 的 TODO 看板经过 P1–P4b 四阶段已可跑通完整流程（多项目看板 → ACP 执行 → In Progress 详情 → Human Review → 真实 git 合并 → Done 数据看板）。但当前流程是**人工驱动**的。用户的最终目标是「需求全托管」：让引擎独立地把一个需求推进到尽可能完整的状态，即一个研发 Harness 平台。

Symphony 是 OpenAI 发布的、恰好定义了这一命题的规范：一个长驻自动化服务，持续从 issue tracker（当前版本为 Linear）读取工作，为每个 issue 创建隔离工作区，并在其中自主运行编码 Agent 会话。其理念是「**管理工作，而非管理 Agent**（manage the work, not the agent）」。

本调研对比二者，抽取 Symphony 中值得借鉴的机制，并给出优先级与第一增量建议。Symphony 是 Elixir 实现，与 orca（Electron/React/TS）技术栈不同，故借鉴价值在**概念与逻辑**，而非代码复用。

---

## 2. 核心范式差距

两个系统处于同一光谱的两端：

| 维度 | orca 现状 | Symphony |
|---|---|---|
| 驱动方式 | 人工驱动（点击）| 无头守护进程 |
| 任务推进 | 一次 prompt 后停下，交人工评审 | 轮询循环持续推进直到交接态 |
| 状态流转 | 几乎全手动 | 编排器根据 worker 结果自动流转 |
| 并发 | 无限制 | 全局 + 按状态的有界并发 |
| 失败处理 | 标记 error，等人工 | 指数退避自动重试 |
| 任务来源 | 仅手动创建 | 从 tracker 轮询读取 |
| 重启恢复 | 无（任务卡在 in_progress）| 靠重新轮询 + 复用工作区恢复 |
| 行为契约 | prompt 在渲染层硬编码 | 仓库自持的 `WORKFLOW.md` |

**关键事实**（orca 侧，来自代码梳理）：

- 唯一的自动流转是 `in_progress → human_review`（prompt 执行成功时，`src/main/acp/acp-session-manager.ts:144`），外加防御性的 `conflict → rework`。
- 执行只在用户打开「Enter In Progress」对话框时启动（`EnterInProgressDialog.tsx` → store `executeTask` → IPC `acp:execute` → `executeRouter.executeEnginePrompt` → `AcpSessionManager.startPrompt`）。
- 无守护进程 / 轮询 / 调度器 / 自动取任务；无并发上限（`activePrompts` 仅防止同一 session 上重复 prompt）；无重试/退避。
- prompt 由渲染层 `EnterInProgressDialog.composePrompt` 拼接：`标题 + 描述 + 临时附加文本`；无仓库自持的行为契约。
- 无重启对账：崩溃后任务会卡在 `in_progress`、`acp_sessions` 留下过期的 `running` 行，直到人工重新打开。

**结论**：orca 已具备所有*执行原语*（`AcpSessionManager`、`executeRouter`、worktree、SQLite），但缺少驱动它们自主运转的*协调层*与*策略层*。

---

## 3. 值得借鉴的机制（按优先级）

### P0 —— 让任务能自我推进（全托管的最小闭环）

**#1 编排器 / 轮询-派发循环**（Symphony §8.1、§16.2）
主进程调度器按 tick 运转：对账运行中任务 → 挑选符合条件的待办项 → 派发直到并发槽位耗尽。仅此一项就能把看板从「手动」变成「自驱动」。orca 完全没有。

**#2 续接轮次 Continuation turns**（§7.1）—— *最重要的概念*
一个 Agent 轮次干净结束后，重新核对 issue 状态；若仍活跃，就在**同一 thread** 上启动下一轮，只发送续接指导（不重发完整 prompt），最多到 `max_turns`，再加约 1 秒的续接重试。这正是让引擎持续工作直到完成的机制。orca 现在一次 prompt 后就停下。

### P1 —— 守护进程的健壮性

**#3 指数退避重试**（§8.4）
`delay = min(10000 * 2^(attempt-1), maxBackoff)`（默认 maxBackoff = 5min）；干净退出的续接重试用固定 1000ms。orca 完全没有重试。

**#4 并发控制**（§8.3）
全局 `max_concurrent_agents`（默认 10）+ 按状态限额 `max_concurrent_agents_by_state`。orca 无任何限制。

**#5 候选筛选 + 优先级排序 + 阻塞门禁**（§8.2）
资格规则；排序：priority 升序 → created_at 最旧优先 → identifier 字典序。*阻塞门禁*：Todo 态下若有非终态阻塞项则不派发——对有依赖关系的研发 Harness 直接相关。orca 有 `priority` 字段但无该逻辑。

**#6 对账 + 停滞检测**（§8.5）
每 tick 两部分：(A) 停滞检测——运行中任务超过 `stall_timeout` 无事件则杀掉并重试；(B) tracker 状态刷新——外部 issue 进入终态则停止并清理工作区。orca 两者都没有。

### P2 —— 策略层与安全姿态（Harness 平台的关键）

**#7 WORKFLOW.md 契约**（§5、§6）
仓库自持文件 = prompt 模板（严格 Liquid，未知变量/过滤器即报错）+ 运行时配置（tracker、polling、workspace、hooks、agent、codex），支持**无需重启的动态热加载**（§6.2）。模板变量含 `issue` 对象与 `attempt`（首跑为 null，续接/重试为整数，可对不同阶段给不同指令）。orca 把 prompt 硬编码在渲染层——这是 Harness 平台可版本化、可按仓库定制行为的最大突破口。

**#8 无人值守的自动审批姿态**（§10.5）
高信任示例：会话内自动批准命令/文件变更审批；把「需要用户输入」当作硬失败，让运行**永不无限期卡死**。orca 的 `AcpPermissionBridge` 目前带超时地抛给人工。全托管需要一套*明确文档化*的自动批准/沙箱策略——关键安全决策，非简单开关。另注：不支持的动态工具调用应返回工具失败并继续会话，避免卡死。

**#9 工作区安全不变量 + 生命周期 hooks**（§9、§15.2）
工作区路径必须在配置根之下；Agent cwd 必须是该 issue 的工作区；目录名用净化后的 identifier。hooks（`after_create`/`before_run`/`after_run`/`before_remove` + `timeout_ms`）让仓库定制工作区的准备与清理。orca 用 worktree，可对齐这套约束。

### P3 —— 闭环任务来源

**#10 外部 tracker 作为任务来源**（§11）
Symphony 把 Linear 当工作队列（`fetch_candidate_issues` / `fetch_issues_by_states` / `fetch_issue_states_by_ids`）。orca 仅手动创建任务——尽管 Linear/GitHub 集成在 App 别处已存在，只是没接入看板。接通 tracker → 待办的接入即形成闭环。注意 Symphony 的边界：tracker 写操作（状态流转、评论、PR 元数据）交给 Agent，服务本身只做调度器/运行器/读取器。

---

## 4. orca 已经领先的地方（应保留）

以下这些 Symphony 明确列为**非目标 / 可选项**，而 orca 已有实打实实现：

- **丰富的人工评审 UI**，带实时 dev-server 浏览器面板（`HumanReviewPanel.tsx`、`src/main/acp/review-port-scan.ts`、IPC `todos:review.scanPorts`）。
- **真实本地 git 合并**，含 ff-only / --no-ff / 冲突处理（`src/main/todos/todo-merge-executor.ts`、`todo-merge-git-facts.ts`）。Symphony 把所有 tracker/PR 写操作交给 Agent。
- **Done 数据看板**，带 token/成本归因（`src/main/todos/todo-dashboard-*.ts`）。
- **多引擎 ACP**（qoder/claude/cursor），Symphony 只支持 Codex app-server。
- **SQLite 持久化**——Symphony 刻意不用数据库、重启丢失调度状态靠 tracker 重建（§14.3）。orca 可做得**更好**：持久化调度状态，重启后真正恢复重试定时器/运行中任务。

orca 已有的交接状态模型（`human_review → merging → done`）与 Symphony 的「成功 = 到达下一个交接态，而非必然到 Done」（§1、§11.5）完美吻合。

---

## 5. 综合判断与第一增量

orca 是强大的**人在环中（human-in-the-loop）Harness UI**；Symphony 是**无头协调引擎**。

要达成需求全托管：在 orca 已有执行原语之上，长出 Symphony 的
- **协调层**：编排循环 + 续接轮次 + 并发 + 重试 + 对账；
- **策略层**：WORKFLOW 契约 + 自动审批姿态；

同时保留 orca 更优的评审/合并/看板，作为引擎交棒的**人工监督面**。

**最高杠杆的第一增量 = #1 + #2（编排循环 + 续接轮次）**：这是让任务能自我推进、而非一次 prompt 后停下的最小闭环。

---

## 6. 待定的设计问题（进入下一阶段设计前需对齐）

1. **调度触发面**：新增独立守护调度器，还是复用现有 IPC/主进程事件循环？tick 周期？
2. **「可自动执行」的建模**：作为新的 todo 状态，还是一个 `autoPilot` 布尔标记？如何与现有 `backlog/todo/...` 九态共存？
3. **续接指导的组织**：续接轮次发送什么内容？如何判断「需求已完整」（交给 Agent 自评 / 有验证 hook / 达到 max_turns）？
4. **自动审批安全姿态**：默认高信任自动批准，还是白名单 + 沙箱？「需要用户输入」如何处理（硬失败 / 挂起给人工）？——需明确文档化。
5. **重启恢复策略**：利用 SQLite 持久化调度状态并恢复重试定时器（优于 Symphony），还是采用 Symphony 的重新轮询式恢复？
6. **WORKFLOW 契约落地**：是否引入仓库自持配置文件？与现有模版（`todo_templates`）、preferredAgent 如何协同？
7. **任务来源**：本阶段是否接入外部 tracker，还是先只服务手动创建的看板任务？

> 建议下一步：对上述问题做一次头脑风暴（brainstorming），产出 #1+#2 第一增量的设计 spec，再进入 TDD 实现。
