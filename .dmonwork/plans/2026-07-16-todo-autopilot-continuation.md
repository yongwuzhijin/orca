# TODO AutoPilot 续接轮次 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让一个 In Progress 任务在同一个 ACP thread 上自主续接多轮，直到 agent 自评"可交人工评审"或达到轮次上限，而不是一次 prompt 后即停。

**Architecture:** 新增 `AutoPilotRunner`（组合 `AcpSessionManager`）编排续接循环 + 纯函数 `parseAutoPilotVerdict` 解析 agent 哨兵行。`AcpSessionManager` 增 `autoPilotSessions` 集合以抑制中途 `in_progress→human_review` 翻转，并暴露 `readLastTurnText` / `readLastOutcome` / `flipToHumanReview`。执行入口 `executeRouter` 在 `opts.autoPilot` 存在时委派给 runner。渲染层加开关 + 轮次徽章 + 停止按钮。

**Tech Stack:** Electron + TypeScript（主进程 ACP 内核）、React + Zustand（渲染层）、Vitest（单测）、项目 i18n（`translate()` + 五语 locale）。

**Spec:** `.dmonwork/specs/2026-07-16-todo-autopilot-continuation-design.md`

---

## File Structure

**主进程（新增）**
- `src/main/acp/autopilot-verdict.ts` — 纯函数 `parseAutoPilotVerdict(text)`；哨兵协议常量 `AUTOPILOT_PROTOCOL` + `composeContinuation(remaining)`。
- `src/main/acp/acp-autopilot-runner.ts` — `createAutoPilotRunner(deps)`，编排续接循环。

**主进程（修改）**
- `src/shared/acp/acp-session.ts` — `StartPromptOptions` 增 `autoPilot?: { maxTurns: number }`。
- `src/main/acp/acp-session-manager.ts` — `autoPilotSessions` 集合 + flip 抑制 + `readLastTurnText` / `readLastOutcome` / `flipToHumanReview`。
- `src/main/acp/acp-execute-router.ts` — 注入可选 `autoPilotRunner`，`opts.autoPilot` 时委派。
- `src/main/acp/acp-kernel.ts` — 构造 `autoPilotRunner` 并传入 router。

**渲染层（修改）**
- `src/preload/acp-api.ts` — 加 `onAutoPilotProgress(taskId, cb)`。
- `src/renderer/src/store/slices/acp.ts` — `ExecuteTaskInput.autoPilot`、`autoPilotByTask` 状态、进度订阅。
- `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx` — AutoPilot 开关 + maxTurns 输入。
- `src/renderer/src/components/todo/detail/InProgressPanel.tsx` — 轮次徽章 + 停止按钮。
- `src/renderer/src/i18n/locales/{en,zh,ja,ko,es}.json` — 新增文案键。

**测试（新增）**
- `src/main/acp/autopilot-verdict.test.ts`
- `src/main/acp/acp-autopilot-runner.test.ts`
- 扩展 `src/main/acp/acp-session-manager.test.ts`、`src/main/acp/acp-execute-router.test.ts`

---

## Task 1: 扩展 StartPromptOptions 类型

**Files:**
- Modify: `src/shared/acp/acp-session.ts:31-37`

- [ ] **Step 1: 加可选 autoPilot 字段**

在 `StartPromptOptions` 类型末尾加一行：

```typescript
export type StartPromptOptions = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  resumeSessionId?: string
  // AutoPilot：存在时执行入口走续接循环，maxTurns 为自主推进的硬上限。
  autoPilot?: { maxTurns: number }
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: PASS（纯新增可选字段，无破坏）

- [ ] **Step 3: Commit**

```bash
git add src/shared/acp/acp-session.ts
git commit -m "feat(acp): add optional autoPilot option to StartPromptOptions"
```

---

## Task 2: 哨兵解析纯函数 parseAutoPilotVerdict

**Files:**
- Create: `src/main/acp/autopilot-verdict.ts`
- Test: `src/main/acp/autopilot-verdict.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/main/acp/autopilot-verdict.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { parseAutoPilotVerdict, composeContinuation } from './autopilot-verdict'

describe('parseAutoPilotVerdict', () => {
  it('parses COMPLETE sentinel', () => {
    expect(parseAutoPilotVerdict('done.\nAUTOPILOT: COMPLETE')).toEqual({
      status: 'complete',
      remaining: null
    })
  })

  it('parses CONTINUE with remaining after em dash', () => {
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE — write tests')).toEqual({
      status: 'continue',
      remaining: 'write tests'
    })
  })

  it('parses CONTINUE with hyphen or colon separators', () => {
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE - more').remaining).toBe('more')
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE: more').remaining).toBe('more')
  })

  it('parses bare CONTINUE with no remaining', () => {
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE')).toEqual({
      status: 'continue',
      remaining: null
    })
  })

  it('treats missing sentinel as continue', () => {
    expect(parseAutoPilotVerdict('just some text, no sentinel')).toEqual({
      status: 'continue',
      remaining: null
    })
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(parseAutoPilotVerdict('  autopilot: complete  ').status).toBe('complete')
  })

  it('uses the last sentinel line when multiple appear', () => {
    const text = 'AUTOPILOT: CONTINUE — early\nmore work\nAUTOPILOT: COMPLETE'
    expect(parseAutoPilotVerdict(text).status).toBe('complete')
  })
})

describe('composeContinuation', () => {
  it('includes remaining when provided', () => {
    expect(composeContinuation('write tests')).toContain('write tests')
  })

  it('omits the remaining clause when null', () => {
    const out = composeContinuation(null)
    expect(out).toContain('AUTOPILOT: COMPLETE')
    expect(out).not.toContain('null')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/main/acp/autopilot-verdict.test.ts`
Expected: FAIL（`Cannot find module './autopilot-verdict'`）

- [ ] **Step 3: 实现**

创建 `src/main/acp/autopilot-verdict.ts`：

```typescript
export type AutoPilotVerdict = { status: 'complete' | 'continue'; remaining: string | null }

// Why: no external tracker in this increment — the completion signal is the
// agent's own sentinel line. Missing sentinel is treated as "continue" so a
// forgotten marker never prematurely hands off to human review.
const SENTINEL = /^autopilot:\s*(complete|continue)\b\s*(?:[—\-:]\s*(.*))?$/i

export function parseAutoPilotVerdict(text: string): AutoPilotVerdict {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = SENTINEL.exec(lines[i].trim())
    if (!m) {
      continue
    }
    if (m[1].toLowerCase() === 'complete') {
      return { status: 'complete', remaining: null }
    }
    const remaining = m[2]?.trim()
    return { status: 'continue', remaining: remaining ? remaining : null }
  }
  return { status: 'continue', remaining: null }
}

export const AUTOPILOT_PROTOCOL = [
  '',
  '',
  '---',
  '【AutoPilot 协议】你正处于自主推进模式。每一轮回复的最后，请单独用一行标注状态，二选一：',
  'AUTOPILOT: COMPLETE — 当需求已推进到可交人工评审的完整状态。',
  'AUTOPILOT: CONTINUE — <一句话说明还差什么> — 当仍需继续推进。'
].join('\n')

export function composeContinuation(remaining: string | null): string {
  const mid = remaining ? `上一轮你标注仍缺：${remaining}。` : ''
  return `继续推进本需求。${mid}完成后在回复末尾按协议标注 AUTOPILOT: COMPLETE 或 AUTOPILOT: CONTINUE。`
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run src/main/acp/autopilot-verdict.test.ts`
Expected: PASS（9 个用例全绿）

- [ ] **Step 5: Commit**

```bash
git add src/main/acp/autopilot-verdict.ts src/main/acp/autopilot-verdict.test.ts
git commit -m "feat(acp): add AutoPilot sentinel verdict parser"
```

---

## Task 3: Manager 加 autoPilot 标记 + flip 抑制

**Files:**
- Modify: `src/main/acp/acp-session-manager.ts`
- Test: `src/main/acp/acp-session-manager.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/main/acp/acp-session-manager.test.ts` 末尾追加一个 describe 块：

```typescript
describe('AcpSessionManager autoPilot flip suppression', () => {
  it('does NOT flip in_progress→human_review when started with autoPilot', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({
      taskId: 'task-1',
      engine: 'claude',
      prompt: 'hi',
      cwd: '/tmp',
      autoPilot: { maxTurns: 5 }
    })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.todos.updateItem).not.toHaveBeenCalledWith('task-1', { status: 'human_review' })
  })

  it('flipToHumanReview flips only when task is still in_progress', () => {
    const d = deps()
    const mgr = makeManager(d)
    d.todos.getItem.mockReturnValue({ id: 'task-1', status: 'in_progress' })
    mgr.flipToHumanReview('task-1')
    expect(d.todos.updateItem).toHaveBeenCalledWith('task-1', { status: 'human_review' })

    d.todos.updateItem.mockClear()
    d.todos.getItem.mockReturnValue({ id: 'task-1', status: 'done' })
    mgr.flipToHumanReview('task-1')
    expect(d.todos.updateItem).not.toHaveBeenCalled()
  })

  it('readLastOutcome reflects the finished turn', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(mgr.readLastOutcome('eng-sess-1')).toBe('completed')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/main/acp/acp-session-manager.test.ts`
Expected: FAIL（`flipToHumanReview` / `readLastOutcome` 不存在；且 autoPilot 用例会因当前无条件 flip 而失败）

- [ ] **Step 3: 实现 —— 加字段与方法**

在 `AcpSessionManager` 类字段区（`src/main/acp/acp-session-manager.ts:52-55`，`canceled` 附近）新增：

```typescript
  private canceled = new Set<string>()
  private autoPilotSessions = new Set<string>()
  private lastOutcome = new Map<string, 'completed' | 'error' | 'canceled'>()
```

在 `startPrompt` 中，取得 `sessionId` 后、调用 `this.runPrompt(...)` 之前（`src/main/acp/acp-session-manager.ts:65` 附近的 `this.engineOf.set(...)` 一组之后）加：

```typescript
    // AutoPilot must be marked before runPrompt starts so the mid-loop turn
    // never flips the task to human_review; the runner owns the final flip.
    if (opts.autoPilot) {
      this.autoPilotSessions.add(sessionId)
    }
```

- [ ] **Step 4: 实现 —— runPrompt 记录 outcome + 抑制 flip**

改写 `runPrompt`（`src/main/acp/acp-session-manager.ts:128-158`）三个终态分支：

```typescript
      if (this.canceled.has(sessionId) || stopReason === 'cancelled') {
        this.lastOutcome.set(sessionId, 'canceled')
        this.deps.acpSessions.finish(sessionId, 'canceled', stopReason ?? 'cancelled')
        this.deps.broadcast('acp:task-outcome', { taskId, sessionId, result: 'canceled' }, taskId)
        return
      }
      // AutoPilot suppresses the per-turn flip; the runner flips once at loop end.
      if (!this.autoPilotSessions.has(sessionId)) {
        const task = this.deps.todos.getItem(taskId)
        if (task?.status === 'in_progress') {
          this.deps.todos.updateItem(taskId, { status: 'human_review' })
        }
      }
      this.lastOutcome.set(sessionId, 'completed')
      this.deps.acpSessions.finish(sessionId, 'completed', stopReason)
      this.deps.broadcast('acp:complete', { sessionId, stopReason }, sessionId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.lastOutcome.set(sessionId, 'error')
      this.deps.acpSessions.finish(sessionId, 'error', message)
      this.deps.broadcast('acp:error', { sessionId, message }, sessionId)
      this.deps.broadcast('acp:task-outcome', { taskId, sessionId, result: 'error' }, taskId)
    }
```

- [ ] **Step 5: 实现 —— 新增公开方法**

在 `setPermissionMode` 方法之后（类末尾）加：

```typescript
  markAutoPilot(sessionId: string): void {
    this.autoPilotSessions.add(sessionId)
  }

  unmarkAutoPilot(sessionId: string): void {
    this.autoPilotSessions.delete(sessionId)
  }

  readLastOutcome(sessionId: string): 'completed' | 'error' | 'canceled' | undefined {
    return this.lastOutcome.get(sessionId)
  }

  flipToHumanReview(taskId: string): void {
    const task = this.deps.todos.getItem(taskId)
    if (task?.status === 'in_progress') {
      this.deps.todos.updateItem(taskId, { status: 'human_review' })
    }
  }
```

- [ ] **Step 6: 运行确认通过**

Run: `pnpm vitest run src/main/acp/acp-session-manager.test.ts`
Expected: PASS（含既有用例 + 3 个新用例）

- [ ] **Step 7: Commit**

```bash
git add src/main/acp/acp-session-manager.ts src/main/acp/acp-session-manager.test.ts
git commit -m "feat(acp): suppress mid-loop human_review flip for autoPilot sessions"
```

---

## Task 4: Manager 读取末轮助手文本 readLastTurnText

**Files:**
- Modify: `src/main/acp/acp-session-manager.ts`
- Test: `src/main/acp/acp-session-manager.test.ts`

- [ ] **Step 1: 写失败测试**

在 Task 3 的 describe 块内追加：

```typescript
  it('readLastTurnText returns agent text only after the last user chunk', () => {
    const d = deps()
    // replaySessionEvents(sessionId, emit) drives emit with cached notifications.
    d.connectionPool.replaySessionEvents.mockImplementation(
      (_sessionId: string, emit: (n: unknown) => void) => {
        emit({ update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'turn1 prompt' } } })
        emit({ update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'old' } } })
        emit({ update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'turn2 prompt' } } })
        emit({ update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'AUTOPILOT: ' } } })
        emit({ update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'COMPLETE' } } })
        return 5
      }
    )
    const mgr = makeManager(d)
    expect(mgr.readLastTurnText('sess-x')).toBe('AUTOPILOT: COMPLETE')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/main/acp/acp-session-manager.test.ts -t readLastTurnText`
Expected: FAIL（`readLastTurnText` 不存在）

- [ ] **Step 3: 实现**

在类末尾（Task 3 新增方法之后）加：

```typescript
  // Why: verdict lives in the just-finished turn only. Collect from the pool's
  // per-session event cache and keep agent text emitted after the last user
  // chunk (each turn records a user_message_chunk before the agent responds).
  readLastTurnText(sessionId: string): string {
    const collected: { role: 'user' | 'agent'; text: string }[] = []
    this.deps.connectionPool.replaySessionEvents(sessionId, (n) => {
      const update = (n as { update?: { sessionUpdate?: string; content?: unknown } }).update
      if (update?.sessionUpdate === 'user_message_chunk') {
        collected.push({ role: 'user', text: '' })
      } else if (update?.sessionUpdate === 'agent_message_chunk') {
        const content = update.content as { type?: string; text?: string } | undefined
        if (content?.type === 'text' && typeof content.text === 'string') {
          collected.push({ role: 'agent', text: content.text })
        }
      }
    })
    let start = 0
    for (let i = collected.length - 1; i >= 0; i--) {
      if (collected[i].role === 'user') {
        start = i + 1
        break
      }
    }
    return collected
      .slice(start)
      .filter((c) => c.role === 'agent')
      .map((c) => c.text)
      .join('')
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run src/main/acp/acp-session-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/acp/acp-session-manager.ts src/main/acp/acp-session-manager.test.ts
git commit -m "feat(acp): read last turn assistant text from session event cache"
```

---

## Task 5: AutoPilotRunner 编排续接循环

**Files:**
- Create: `src/main/acp/acp-autopilot-runner.ts`
- Test: `src/main/acp/acp-autopilot-runner.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/main/acp/acp-autopilot-runner.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createAutoPilotRunner } from './acp-autopilot-runner'

type Outcome = 'completed' | 'error' | 'canceled'

function makeSessionManager(turns: { text: string; outcome: Outcome }[]) {
  let turn = 0
  const sm = {
    startPrompt: vi.fn(async () => ({ sessionId: 'sess-1' })),
    promptExisting: vi.fn(async () => {
      turn++
    }),
    waitForPrompt: vi.fn(async () => {}),
    readLastTurnText: vi.fn(() => turns[turn]?.text ?? ''),
    readLastOutcome: vi.fn<[], Outcome>(() => turns[turn]?.outcome ?? 'completed'),
    markAutoPilot: vi.fn(),
    unmarkAutoPilot: vi.fn(),
    setPermissionMode: vi.fn(),
    flipToHumanReview: vi.fn()
  }
  return sm
}

const opts = {
  taskId: 'task-1',
  engine: 'claude' as const,
  prompt: 'do it',
  cwd: '/tmp',
  autoPilot: { maxTurns: 5 }
}

describe('createAutoPilotRunner', () => {
  it('flips to human_review after a turn-1 COMPLETE', async () => {
    const sm = makeSessionManager([{ text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    const res = await runner.run(opts)
    expect(res.sessionId).toBe('sess-1')
    expect(sm.promptExisting).not.toHaveBeenCalled()
    expect(sm.flipToHumanReview).toHaveBeenCalledWith('task-1')
    expect(sm.unmarkAutoPilot).toHaveBeenCalledWith('sess-1')
  })

  it('continues then completes across two turns', async () => {
    const sm = makeSessionManager([
      { text: 'AUTOPILOT: CONTINUE — more', outcome: 'completed' },
      { text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }
    ])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    expect(sm.promptExisting).toHaveBeenCalledTimes(1)
    expect(sm.flipToHumanReview).toHaveBeenCalledTimes(1)
  })

  it('stops at maxTurns and flips (fallback)', async () => {
    const sm = makeSessionManager(
      Array.from({ length: 6 }, () => ({ text: 'AUTOPILOT: CONTINUE', outcome: 'completed' as Outcome }))
    )
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run({ ...opts, autoPilot: { maxTurns: 3 } })
    // 3 turns total => 2 continuation prompts after turn 1
    expect(sm.promptExisting).toHaveBeenCalledTimes(2)
    expect(sm.flipToHumanReview).toHaveBeenCalledTimes(1)
  })

  it('stops without flip when a turn errors', async () => {
    const sm = makeSessionManager([{ text: '', outcome: 'error' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    expect(sm.flipToHumanReview).not.toHaveBeenCalled()
    expect(sm.unmarkAutoPilot).toHaveBeenCalledWith('sess-1')
  })

  it('stops without flip when canceled', async () => {
    const sm = makeSessionManager([{ text: '', outcome: 'canceled' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    expect(sm.flipToHumanReview).not.toHaveBeenCalled()
  })

  it('appends the sentinel protocol to the first-turn prompt and sets auto mode', async () => {
    const sm = makeSessionManager([{ text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }])
    const runner = createAutoPilotRunner({ sessionManager: sm as never })
    await runner.run(opts)
    const sent = sm.startPrompt.mock.calls[0][0]
    expect(sent.prompt).toContain('do it')
    expect(sent.prompt).toContain('AUTOPILOT: COMPLETE')
    expect(sm.setPermissionMode).toHaveBeenCalledWith('sess-1', 'auto')
  })

  it('broadcasts per-turn progress', async () => {
    const sm = makeSessionManager([{ text: 'AUTOPILOT: COMPLETE', outcome: 'completed' }])
    const broadcast = vi.fn()
    const runner = createAutoPilotRunner({ sessionManager: sm as never, broadcast })
    await runner.run(opts)
    expect(broadcast).toHaveBeenCalledWith(
      'acp:autopilot-progress',
      expect.objectContaining({ taskId: 'task-1', sessionId: 'sess-1', turn: 1, maxTurns: 5 }),
      'task-1'
    )
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/main/acp/acp-autopilot-runner.test.ts`
Expected: FAIL（`Cannot find module './acp-autopilot-runner'`）

- [ ] **Step 3: 实现**

创建 `src/main/acp/acp-autopilot-runner.ts`：

```typescript
import type { StartPromptOptions, StartPromptResult } from '../../shared/acp/acp-session'
import {
  parseAutoPilotVerdict,
  composeContinuation,
  AUTOPILOT_PROTOCOL,
  type AutoPilotVerdict
} from './autopilot-verdict'

type RunnerSessionManager = {
  startPrompt: (opts: StartPromptOptions) => Promise<StartPromptResult>
  promptExisting: (sessionId: string, prompt: string) => Promise<void>
  waitForPrompt: (sessionId: string) => Promise<void>
  readLastTurnText: (sessionId: string) => string
  readLastOutcome: (sessionId: string) => 'completed' | 'error' | 'canceled' | undefined
  markAutoPilot: (sessionId: string) => void
  unmarkAutoPilot: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: 'auto' | 'ask') => void
  flipToHumanReview: (taskId: string) => void
}

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type AutoPilotRunnerDeps = {
  sessionManager: RunnerSessionManager
  parseVerdict?: (text: string) => AutoPilotVerdict
  broadcast?: BroadcastFn
}

type AutoPilotRunOptions = StartPromptOptions & { autoPilot: { maxTurns: number } }

export function createAutoPilotRunner(deps: AutoPilotRunnerDeps) {
  const parseVerdict = deps.parseVerdict ?? parseAutoPilotVerdict
  const broadcast = deps.broadcast ?? ((): void => {})
  const sm = deps.sessionManager

  return {
    async run(opts: AutoPilotRunOptions): Promise<StartPromptResult> {
      const maxTurns = Math.max(1, Math.floor(opts.autoPilot.maxTurns))
      const firstPrompt = `${opts.prompt}${AUTOPILOT_PROTOCOL}`
      const { sessionId } = await sm.startPrompt({ ...opts, prompt: firstPrompt })
      // startPrompt already marks autoPilot when opts.autoPilot is set; mark again
      // defensively and force auto approval for the unattended loop.
      sm.markAutoPilot(sessionId)
      sm.setPermissionMode(sessionId, 'auto')

      let turn = 1
      try {
        for (;;) {
          await sm.waitForPrompt(sessionId)
          const outcome = sm.readLastOutcome(sessionId)
          broadcast('acp:autopilot-progress', { taskId: opts.taskId, sessionId, turn, maxTurns }, opts.taskId)
          if (outcome === 'error' || outcome === 'canceled') {
            return { sessionId }
          }
          const verdict = parseVerdict(sm.readLastTurnText(sessionId))
          if (verdict.status === 'complete' || turn >= maxTurns) {
            sm.flipToHumanReview(opts.taskId)
            return { sessionId }
          }
          turn++
          await sm.promptExisting(sessionId, composeContinuation(verdict.remaining))
        }
      } finally {
        sm.unmarkAutoPilot(sessionId)
      }
    }
  }
}

export type AutoPilotRunner = ReturnType<typeof createAutoPilotRunner>
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run src/main/acp/acp-autopilot-runner.test.ts`
Expected: PASS（7 个用例全绿）

- [ ] **Step 5: Commit**

```bash
git add src/main/acp/acp-autopilot-runner.ts src/main/acp/acp-autopilot-runner.test.ts
git commit -m "feat(acp): add AutoPilotRunner continuation loop"
```

---

## Task 6: executeRouter 委派给 AutoPilotRunner

**Files:**
- Modify: `src/main/acp/acp-execute-router.ts`
- Test: `src/main/acp/acp-execute-router.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/main/acp/acp-execute-router.test.ts` 追加：

```typescript
  it('delegates to autoPilotRunner when opts.autoPilot is present', async () => {
    const sessionManager = { startPrompt: vi.fn(async () => ({ sessionId: 's1' })) }
    const autoPilotRunner = { run: vi.fn(async () => ({ sessionId: 's2' })) }
    const router = createExecuteRouter({ sessionManager, autoPilotRunner } as never)
    const res = await router.executeEnginePrompt({
      taskId: 't1',
      engine: 'claude',
      prompt: 'x',
      cwd: '/tmp',
      autoPilot: { maxTurns: 4 }
    })
    expect(autoPilotRunner.run).toHaveBeenCalledOnce()
    expect(sessionManager.startPrompt).not.toHaveBeenCalled()
    expect(res.sessionId).toBe('s2')
  })

  it('uses startPrompt when autoPilot is absent', async () => {
    const sessionManager = { startPrompt: vi.fn(async () => ({ sessionId: 's1' })) }
    const autoPilotRunner = { run: vi.fn() }
    const router = createExecuteRouter({ sessionManager, autoPilotRunner } as never)
    await router.executeEnginePrompt({ taskId: 't1', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    expect(sessionManager.startPrompt).toHaveBeenCalledOnce()
    expect(autoPilotRunner.run).not.toHaveBeenCalled()
  })
```

（若该文件顶部尚未 `import { vi }`，补齐 import。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/main/acp/acp-execute-router.test.ts`
Expected: FAIL（autoPilot 分支未实现）

- [ ] **Step 3: 实现**

改写 `src/main/acp/acp-execute-router.ts`：

```typescript
import { isAcpEngine } from '../../shared/acp/acp-session'
import type { StartPromptOptions, StartPromptResult } from '../../shared/acp/acp-session'

export class EngineFallbackNotWired extends Error {
  constructor(engine: string) {
    super(`PTY fallback for engine "${engine}" is not wired in P2a`)
    this.name = 'EngineFallbackNotWired'
  }
}

type SessionManagerLike = {
  startPrompt: (opts: StartPromptOptions) => Promise<StartPromptResult>
}

type AutoPilotRunnerLike = {
  run: (opts: StartPromptOptions & { autoPilot: { maxTurns: number } }) => Promise<StartPromptResult>
}

export function createExecuteRouter(deps: {
  sessionManager: SessionManagerLike
  autoPilotRunner?: AutoPilotRunnerLike
}) {
  return {
    async executeEnginePrompt(opts: StartPromptOptions): Promise<StartPromptResult> {
      // claude/qoder/cursor speak ACP; other engines have no PTY fallback in P2a.
      if (isAcpEngine(opts.engine)) {
        if (opts.autoPilot && deps.autoPilotRunner) {
          return deps.autoPilotRunner.run({ ...opts, autoPilot: opts.autoPilot })
        }
        return deps.sessionManager.startPrompt(opts)
      }
      throw new EngineFallbackNotWired(String(opts.engine))
    }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm vitest run src/main/acp/acp-execute-router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/acp/acp-execute-router.ts src/main/acp/acp-execute-router.test.ts
git commit -m "feat(acp): route autoPilot executions to the continuation runner"
```

---

## Task 7: acp-kernel 构造并接线 AutoPilotRunner

**Files:**
- Modify: `src/main/acp/acp-kernel.ts:1-38`

- [ ] **Step 1: 接线**

改写 `src/main/acp/acp-kernel.ts` 的 import 与 build 尾部：

```typescript
import { AcpConnectionPool, type PoolDeps } from './acp-connection-pool'
import { AcpPermissionBridge } from './acp-permission-bridge'
import { AcpSessionManager } from './acp-session-manager'
import { createExecuteRouter } from './acp-execute-router'
import { createAutoPilotRunner } from './acp-autopilot-runner'
```

将 `createExecuteRouter` 一行替换为：

```typescript
  const autoPilotRunner = createAutoPilotRunner({
    sessionManager,
    broadcast: deps.broadcast
  })
  const executeRouter = createExecuteRouter({ sessionManager, autoPilotRunner })
  return { connectionPool, permissionBridge, sessionManager, executeRouter, autoPilotRunner }
```

- [ ] **Step 2: 类型检查 + 相关测试**

Run: `pnpm typecheck && pnpm vitest run src/main/acp`
Expected: PASS（kernel 及 acp 目录全绿）

- [ ] **Step 3: Commit**

```bash
git add src/main/acp/acp-kernel.ts
git commit -m "feat(acp): wire AutoPilotRunner into the ACP kernel"
```

---

## Task 8: preload 暴露 AutoPilot 进度订阅

**Files:**
- Modify: `src/preload/acp-api.ts:41-43`

- [ ] **Step 1: 加订阅方法**

在 `onTaskOutcome` 之后加一行：

```typescript
    onTaskOutcome: (taskId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:task-outcome:${taskId}`, cb),
    onAutoPilotProgress: (taskId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:autopilot-progress:${taskId}`, cb)
```

- [ ] **Step 2: 类型检查（含 preload shape 测试）**

Run: `pnpm typecheck && pnpm vitest run src/preload/acp-api-shape.test.ts`
Expected: PASS（若 shape 测试断言了键集合，按其模式补上 `onAutoPilotProgress`）

- [ ] **Step 3: Commit**

```bash
git add src/preload/acp-api.ts
git commit -m "feat(acp): expose autoPilot progress subscription in preload"
```

---

## Task 9: 渲染层 store —— autoPilot 输入与进度状态

**Files:**
- Modify: `src/renderer/src/store/slices/acp.ts`

- [ ] **Step 1: 扩展 ExecuteTaskInput 与 slice 状态类型**

在 `ExecuteTaskInput`（`:21-27`）加字段：

```typescript
export type ExecuteTaskInput = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  resumeSessionId?: string
  autoPilot?: { maxTurns: number }
}
```

在 `AcpSlice` 类型（`:29-46`）加状态与动作：

```typescript
  autoPilotByTask: Record<string, { turn: number; maxTurns: number } | null>
```

- [ ] **Step 2: 初始化状态**

在 return 对象初始态（`:82-89`）加：

```typescript
    autoPilotByTask: {},
```

- [ ] **Step 3: executeTask 订阅进度**

在 `executeTask`（`:127-143`）内、`subscribeSession` 之后加进度订阅（仅在 autoPilot 开启时）：

```typescript
    executeTask: async (input) => {
      const { sessionId } = (await window.api.acp.execute(input)) as { sessionId: string }
      get().subscribeSession(sessionId, input.taskId)
      if (input.autoPilot) {
        set((s) => ({
          autoPilotByTask: {
            ...s.autoPilotByTask,
            [input.taskId]: { turn: 0, maxTurns: input.autoPilot.maxTurns }
          }
        }))
        window.api.acp.onAutoPilotProgress(input.taskId, (p) => {
          const prog = p as { turn: number; maxTurns: number }
          set((s) => ({
            autoPilotByTask: {
              ...s.autoPilotByTask,
              [input.taskId]: { turn: prog.turn, maxTurns: prog.maxTurns }
            }
          }))
        })
      }
      appendEvent(sessionId, { kind: 'user_message', text: input.prompt })
      set((s) => ({
        activeSessionByTask: { ...s.activeSessionByTask, [input.taskId]: sessionId },
        activeSessionMetaByTask: {
          ...s.activeSessionMetaByTask,
          [input.taskId]: { engine: input.engine, cwd: input.cwd }
        },
        sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'running' }
      }))
      return sessionId
    },
```

- [ ] **Step 4: 类型检查**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/store/slices/acp.ts
git commit -m "feat(todo): track autoPilot turn progress in the acp store slice"
```

---

## Task 10: EnterInProgressDialog 加 AutoPilot 开关

**Files:**
- Modify: `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx`
- Test: `src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `EnterInProgressDialog.test.tsx` 追加（沿用文件既有 render 辅助；此处示意用 `@testing-library/react` + `userEvent`）：

```typescript
  it('passes autoPilot with default maxTurns when the toggle is on', async () => {
    const executeTask = vi.fn(async () => 'sess-1')
    // ...store setup so useAppStore returns executeTask (mirror existing tests)...
    renderDialog() // existing helper
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ autoPilot: { maxTurns: 10 } })
    )
  })

  it('omits autoPilot when the toggle is off', async () => {
    const executeTask = vi.fn(async () => 'sess-1')
    renderDialog()
    await userEvent.click(screen.getByLabelText(/autopilot/i)) // turn off (default on)
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ autoPilot: undefined })
    )
  })
```

> 注：Radix 控件在 happy-dom 下须用 `userEvent.click`，不要用 `fireEvent.click`（既有 P4b 踩坑记录）。若沿用原生 `<input type="checkbox">` 则不受此限。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`
Expected: FAIL（尚无开关，autoPilot 未传）

- [ ] **Step 3: 实现 —— 加状态**

在 `EnterInProgressDialog`（`:50-54`）状态区加：

```typescript
  const [autoPilotOn, setAutoPilotOn] = React.useState(true)
  const [maxTurns, setMaxTurns] = React.useState(10)
```

- [ ] **Step 4: 实现 —— confirm 传参**

改 `confirm` 里的 `executeTask` 调用（`:73-78`）：

```typescript
    await executeTask({
      taskId: item.id,
      engine,
      prompt: composePrompt(base, extra),
      cwd: cwd.trim(),
      autoPilot: autoPilotOn ? { maxTurns } : undefined
    })
```

- [ ] **Step 5: 实现 —— UI 控件**

在「Additional prompt」块（`:132-145`）之后、按钮行之前插入：

```tsx
          <div className="flex items-center gap-3">
            <input
              id="enter-autopilot"
              type="checkbox"
              className="size-4"
              checked={autoPilotOn}
              onChange={(e) => setAutoPilotOn(e.target.checked)}
            />
            <Label htmlFor="enter-autopilot" className="cursor-pointer">
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.autoPilot',
                'AutoPilot (advance autonomously)'
              )}
            </Label>
            {autoPilotOn ? (
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="enter-max-turns" className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.todo.detail.EnterInProgressDialog.maxTurns',
                    'Max turns'
                  )}
                </Label>
                <input
                  id="enter-max-turns"
                  type="number"
                  min={1}
                  className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            ) : null}
          </div>
```

- [ ] **Step 6: 运行确认通过**

Run: `pnpm vitest run src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx
git commit -m "feat(todo): add AutoPilot toggle and max-turns control to start dialog"
```

---

## Task 11: InProgressPanel 加轮次徽章 + 停止按钮

**Files:**
- Modify: `src/renderer/src/components/todo/detail/InProgressPanel.tsx`

- [ ] **Step 1: 读取进度状态**

在 `InProgressPanel` 的 selector 区（`:34-39` 附近）加：

```typescript
  const autoPilot = useAppStore((s) => s.autoPilotByTask[item.id] ?? null)
```

- [ ] **Step 2: 渲染徽章 + 停止按钮**

在返回的会话布局中，`<SessionConversation ... />` 之上（`:109` 前）加一个头部条，仅在 autoPilot 活跃且会话运行中显示：

```tsx
      {autoPilot && status === 'running' ? (
        <div className="mb-2 flex items-center gap-3">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {translate('auto.components.todo.detail.InProgressPanel.autoPilotBadge', 'AutoPilot')}
            {` ${autoPilot.turn}/${autoPilot.maxTurns}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void cancelSession(activeSessionId)}
          >
            {translate('auto.components.todo.detail.InProgressPanel.stopAutoPilot', 'Stop AutoPilot')}
          </Button>
        </div>
      ) : null}
```

> 注：徽章条需要与 `SessionConversation` 一起被包在同一容器里。若当前 `showPlan` 分支的右列直接是 `<SessionConversation>`，用一个 `<div className="flex min-h-0 min-w-0 flex-col">` 包住「徽章条 + SessionConversation」，避免破坏 grid 布局。

- [ ] **Step 3: 类型检查 + 组件测试（若有）**

Run: `pnpm typecheck && pnpm vitest run src/renderer/src/components/todo/detail`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/todo/detail/InProgressPanel.tsx
git commit -m "feat(todo): show AutoPilot turn badge and stop button in progress panel"
```

---

## Task 12: 本地化五语齐全 + 校验

**Files:**
- Modify: `src/renderer/src/i18n/locales/{en,zh,ja,ko,es}.json`

新增 4 个键（路径示意，实际按各 locale 现有嵌套结构落位）：
- `auto.components.todo.detail.EnterInProgressDialog.autoPilot`
- `auto.components.todo.detail.EnterInProgressDialog.maxTurns`
- `auto.components.todo.detail.InProgressPanel.autoPilotBadge`
- `auto.components.todo.detail.InProgressPanel.stopAutoPilot`

- [ ] **Step 1: en.json**

```json
"autoPilot": "AutoPilot (advance autonomously)",
"maxTurns": "Max turns"
```
```json
"autoPilotBadge": "AutoPilot",
"stopAutoPilot": "Stop AutoPilot"
```

- [ ] **Step 2: zh.json**

```json
"autoPilot": "AutoPilot（自主推进）",
"maxTurns": "最大轮次"
```
```json
"autoPilotBadge": "AutoPilot",
"stopAutoPilot": "停止自主推进"
```

- [ ] **Step 3: ja.json**

```json
"autoPilot": "AutoPilot（自動推進）",
"maxTurns": "最大ターン数"
```
```json
"autoPilotBadge": "AutoPilot",
"stopAutoPilot": "AutoPilot を停止"
```

- [ ] **Step 4: ko.json**

```json
"autoPilot": "AutoPilot(자동 진행)",
"maxTurns": "최대 턴 수"
```
```json
"autoPilotBadge": "AutoPilot",
"stopAutoPilot": "AutoPilot 중지"
```

- [ ] **Step 5: es.json**

```json
"autoPilot": "AutoPilot (avanzar de forma autónoma)",
"maxTurns": "Turnos máximos"
```
```json
"autoPilotBadge": "AutoPilot",
"stopAutoPilot": "Detener AutoPilot"
```

- [ ] **Step 6: 同步 + 校验本地化目录与覆盖**

Run: `pnpm run sync:localization-catalog && pnpm run verify:localization-catalog && pnpm run verify:localization-coverage`
Expected: PASS（无缺失键、无未翻译项）

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/zh.json src/renderer/src/i18n/locales/ja.json src/renderer/src/i18n/locales/ko.json src/renderer/src/i18n/locales/es.json
git commit -m "feat(i18n): add AutoPilot toggle and badge strings across locales"
```

---

## Task 13: 全量验证

- [ ] **Step 1: 类型 + lint + 全测试**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run`
Expected: 全 PASS（lint 含 max-lines ratchet 与本地化覆盖；如 `InProgressPanel.tsx` 逼近 max-lines，将徽章条抽到同目录小组件 `AutoPilotStatusBar.tsx` 而非提升行数上限）

- [ ] **Step 2: 手动验证（若可跑 UI）**

启动 dev，新建任务 → Start 对话框默认 AutoPilot on/maxTurns=10 → 观察会话多轮续接、徽章 `轮次 N/最大` 递增、agent 标注 COMPLETE 后任务翻到 human_review；点「停止自主推进」中途终止不翻转。

若无法跑 UI，明确说明未做 UI 手测，仅单测 + 类型 + lint 通过。

---

## Self-Review 结果

- **Spec 覆盖**：§2 组件（Task 2/5 + 类型 Task 1）、§3 数据流（Task 6/7/9）、§4 哨兵协议（Task 2）、§5 自动批准（Task 5 setPermissionMode）、§6 错误处理与 flip 抑制（Task 3/5）、§7 UX（Task 10/11）、§8 测试（Task 2/3/4/5/6/10）、i18n DoD（Task 12）。全部有对应任务。
- **占位符扫描**：无 TBD / "add error handling" 等；每个代码步给出完整代码。
- **类型一致性**：`autoPilot: { maxTurns: number }` 贯穿 shared 类型 / router / runner / store / dialog；manager 新方法名 `markAutoPilot` / `unmarkAutoPilot` / `readLastOutcome` / `readLastTurnText` / `flipToHumanReview` 在 Task 3/4 定义、Task 5 runner 依赖签名一致；广播频道 `acp:autopilot-progress` 在 runner(Task5)/preload(Task8)/store(Task9) 一致。
- **范围**：仅续接轮次；调度器/tracker/重启恢复明确不在本计划（见 spec §9）。
