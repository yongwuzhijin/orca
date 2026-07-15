# TODO AutoPilot 续接轮次 —— 设计 spec（第一增量）

- **日期**：2026-07-16
- **状态**：设计（Design spec）—— 待用户评审通过后转入实现计划（TDD）
- **上游**：`2026-07-15-symphony-full-hosting-research.md`（对标 Symphony 的调研）
- **范围**：需求全托管（P5）的**最高杠杆第一增量** = 续接轮次（Symphony §7.1 的 #2 机制）。**不做**自动取任务的调度器（#1）、不接外部 tracker、不做重启恢复。

---

## 0. 一句话目标

让一个 In Progress 任务在**同一个 ACP thread** 上自主续接多轮，直到 agent 自评"已可交人工评审"或达到轮次硬上限，而不是像现在这样一次 prompt 后就停下翻转到 `human_review`。

---

## 1. 现状与差距（来自代码梳理）

- `AcpSessionManager.runPrompt`（`src/main/acp/acp-session-manager.ts:144-147`）在每次 prompt 干净结束时执行：若任务 `status === 'in_progress'` 就翻转到 `human_review`。这是唯一的自动流转。
- `promptExisting(sessionId, prompt)`（同文件 :160）已是现成的**同 thread 续接原语**：记录 user_message_chunk 后在同一 session 上再跑一轮。
- `waitForPrompt(sessionId)`（:197）返回 `activePrompts` 里的 Promise，可用于等待一轮结束。
- `AcpConnectionPool.replaySessionEvents` / `eventCache` 缓存了 `agent_message_chunk` / `user_message_chunk`，可取回**每轮助手文本**。
- `AcpPermissionBridge.autoAllow` 默认 `true`，`modeFor()` 默认 `'auto'` —— auto 模式下广播后立即以 `firstAllowOptionId` 放行。**自动批准基本已是默认行为**。

**差距**：orca 有全部执行原语，缺"把它们串成续接循环"的编排层，以及"何时算完成"的判定信号。

---

## 2. 架构与组件

采用**组合**而非继承 `AcpSessionManager`（后者同时服务手动执行与续接原语，不应被编排逻辑侵入）。三个新增单元，均遵循现有 `todo-merge-executor` 的注入式可测试模式。

| 组件 | 文件 | 职责 |
|---|---|---|
| `AutoPilotRunner` | `src/main/acp/acp-autopilot-runner.ts` | 编排续接循环：起首轮 → 等待 → 解析裁决 → 续接 or 收尾。组合 `AcpSessionManager`。 |
| `parseAutoPilotVerdict` | `src/main/acp/autopilot-verdict.ts` | 纯函数：`(text) => { status: 'complete' \| 'continue'; remaining: string \| null }`。从末尾扫哨兵行；缺失→continue。 |
| 类型扩展 | `src/shared/acp/acp-session.ts` | `StartPromptOptions` 增补可选 `autoPilot?: { maxTurns: number }`。 |

`AutoPilotRunner` 依赖（注入）：
- `sessionManager`：`startPrompt` / `promptExisting` / `waitForPrompt` / `readLastTurnText` / `markAutoPilot` / `setPermissionMode` / `todos`（收尾翻转）。
- `parseVerdict`：注入 `parseAutoPilotVerdict`，便于测试替身。
- `broadcast`：向渲染层广播 AutoPilot 轮次进度事件。

---

## 3. 数据流

```
EnterInProgressDialog（AutoPilot 开关 on）
  → IPC acp:execute { ...opts, autoPilot: { maxTurns } }
  → executeRouter.executeEnginePrompt
      · 无 autoPilot → 现状 startPrompt（一轮即停，翻转 human_review）
      · 有 autoPilot → autoPilotRunner.run(opts)
          markAutoPilot(sessionId)               // 抑制中途 flip
          turn=1: startPrompt(opts + 首轮哨兵协议指令)
          setPermissionMode(sessionId, 'auto')
          loop:
            await waitForPrompt(sessionId)
            if errored/canceled: break（不翻转，见 §6）
            text = readLastTurnText(sessionId)
            verdict = parseVerdict(text)
            broadcast 轮次进度 { turn, maxTurns, status }
            if verdict.status==='complete' || turn>=maxTurns: break
            turn++
            promptExisting(sessionId, continuationGuidance(verdict.remaining))
          finally:
            unmarkAutoPilot(sessionId)
            若正常收尾（complete 或 maxTurns）→ todos in_progress→human_review
```

**首轮**通过 `startPrompt` 起 thread（拿到 sessionId）；**后续轮**通过 `promptExisting` 在同 thread 续接，只发轻量续接指导，**不重发完整 prompt**（Symphony §7.1 核心）。

---

## 4. 哨兵协议（完成信号）

本增量无外部 tracker，完成信号来自 **agent 自评的哨兵行**（同轮内）。

- **首轮指令块**（拼在 `composePrompt` 输出之后）：要求 agent 每轮回复以独立一行结尾，二选一：
  - `AUTOPILOT: COMPLETE` —— 需求已推进到可交人工评审。
  - `AUTOPILOT: CONTINUE — <还差什么>` —— 仍需继续，简述剩余项。
- **续接指导** `continuationGuidance(remaining)`：`"继续推进本需求。上一轮你标注仍缺：<remaining>。完成后按协议在末尾标注 AUTOPILOT: COMPLETE 或 AUTOPILOT: CONTINUE。"`（remaining 为空时省略中间句）。

### 4.1 解析规则（`parseAutoPilotVerdict`）

- 从文本**末尾向上**扫描，匹配首个哨兵行。
- 命中 `AUTOPILOT: COMPLETE`（忽略大小写、容忍前后空白）→ `{ status:'complete', remaining:null }`。
- 命中 `AUTOPILOT: CONTINUE`（可跟 `—`/`-`/`:` + 文本）→ `{ status:'continue', remaining: <提取文本或 null> }`。
- **无任何哨兵行 → `{ status:'continue', remaining:null }`**（保守：宁可多推进一轮到 maxTurns 兜底，也不因漏标而误判完成、过早交人工）。

---

## 5. 自动批准接线

- runner 在首轮 session-ready 后调用 `sessionManager.setPermissionMode(sessionId, 'auto')`（透传到 `AcpPermissionBridge.setPermissionMode`）。
- 因 `autoAllow` 本就默认 `true`，此处主要是**保证**处于 auto、并让语义显式化，无需新建放行机制。
- **安全姿态（须文档化）**：AutoPilot 期间会话内命令/文件变更被自动放行，**唯一护栏是任务 worktree 的隔离**，无额外沙箱。这是对齐 Symphony §10.5 "高信任" 的**有意取舍**；仅对用户显式开启 AutoPilot 的任务生效。"需要用户输入"类权限在 auto 模式下不会无限期挂起（bridge 立即放行）。

---

## 6. 错误处理

| 情形 | 行为 | 依据 |
|---|---|---|
| 某轮 prompt 抛错 | 停止循环，**不翻转**状态（留在 in_progress 供人工重试） | 沿用现有 `runPrompt` catch 语义 |
| 达到 maxTurns 仍 continue | 翻转 `human_review`（交人工兜底） | maxTurns 是硬上限 |
| agent 自评 complete | 翻转 `human_review` | 正常收尾 |
| 用户点"停止自主推进" / cancel | `cancelSession` → 循环 break，不翻转 | 复用现有取消路径 |
| 非 ACP 引擎 | AutoPilot 不可用，回退现有一轮语义 | executeRouter 已有 `EngineFallbackNotWired` |
| app 重启 | 循环内存态丢失（**本增量不做**恢复） | 列入后续 P1（SQLite 调度状态持久化） |

### 6.1 flip 抑制

`AcpSessionManager` 增 `autoPilotSessions: Set<string>`（镜像现有 `canceled: Set<string>`）。`runPrompt` 里 `in_progress→human_review` 那句，在 `autoPilotSessions.has(sessionId)` 时**跳过**——收尾翻转统一由 `AutoPilotRunner` 在 finally 里做一次。新增方法：`markAutoPilot(id)` / `unmarkAutoPilot(id)` / `readLastTurnText(id)`。

`maxTurns` 默认 **10**（用户拍板）。

---

## 7. UX

- **EnterInProgressDialog**：新增 "AutoPilot 自主推进" 开关（默认 **on**）+ maxTurns 数字输入（默认 10）。
- **In Progress 详情**：AutoPilot 运行中显示徽章 `轮次 N / 最大` + "停止自主推进" 按钮（→ `cancelSession`）。轮次进度来自 runner 的 broadcast 事件。
- **i18n**：所有新文案走 `translate('…','English fallback')`，`en/zh/ja/ko/es` 五语齐全并跑 `verify:localization-*`（AGENTS.md 硬性 DoD）。

---

## 8. 测试（TDD，先写测试）

1. `src/main/acp/autopilot-verdict.test.ts`：
   - `COMPLETE` → complete/null
   - `CONTINUE — 剩余X` → continue/"剩余X"
   - `CONTINUE`（无破折号/无文本）→ continue/null
   - 缺失哨兵 → continue/null
   - 多行文本取**末位**哨兵；大小写 + `—`/`-`/`:` 变体
2. `src/main/acp/acp-autopilot-runner.test.ts`（注入 fake sessionManager）：
   - 首轮即 complete → 1 轮后翻转 human_review
   - continue→complete → 2 轮后翻转
   - 全程 continue 到 maxTurns → 翻转（兜底）
   - 某轮错误 → 停止、**不翻转**
   - cancel → 停止、不翻转
   - **flip 抑制**：中途轮次不触发 human_review
3. 扩展 `acp-session-manager` 测试：`autoPilotSessions` 标记下 `runPrompt` 跳过中途 flip；`readLastTurnText` 取回末轮助手文本。
4. i18n 覆盖校验（`verify:localization-coverage`）。

---

## 9. 明确不在本增量范围

- 自动取任务的调度器 / 轮询循环（#1）。
- 外部 tracker 接入（#10）。
- 指数退避重试、并发上限、停滞检测、对账（#3–#6）。
- WORKFLOW.md 仓库自持契约（#7）。
- app 重启后的循环恢复（SQLite 调度状态持久化）。

这些是后续阶段；本增量只交付"任务能自我推进直到交接态"的最小闭环。
