# TODO 看板 P2b 实现计划:In Progress 详情 + Session 对话 + cursor ACP 接入

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 P2a 的 ACP 执行内核之上,接入 cursor 原生 ACP、加会话级权限模式、项目默认工作目录,并落地渲染层 In Progress 详情全页(Plan / 进度 / Session 对话)+ 进 In Progress 弹窗。

**Architecture:** 纯渲染层集成 + 少量主进程扩展,复用 P2a 已建的 `acp:*` IPC/事件契约。主进程只加三处(cursor 引擎分流/鉴权/扩展方法、权限模式分支、`default_working_dir` 迁移);渲染层新增独立 `acp` slice(会话运行态)+ `todo/detail/` 组件族 + todos slice 内页导航。内核算法零改动。

**Tech Stack:** Electron(main/renderer/preload/shared)、TypeScript、zustand、`@agentclientprotocol/sdk`、SQLite(better-sqlite3 同步封装)、vitest + React Testing Library、shadcn primitives。

---

## 执行者须知(每个任务都适用)

- **测试命令(单文件)**:`npx vitest run --config config/vitest.config.ts <path/to/file.test.ts> 2>&1 | tail -n 30`
- **测试命令(目录)**:`npx vitest run --config config/vitest.config.ts <dir> 2>&1 | tail -n 30`
- **类型检查**:`pnpm typecheck 2>&1 | tail -n 30`
- **绝不**跑裸的全量 `pnpm test`(输出上千行会撑爆上下文)。
- **max-lines**:禁止加 `eslint-disable max-lines` / 改 baseline。文件将超限时按职责拆分(本计划已按小文件设计)。
- **命名**:禁止 `helpers`/`utils`/`common` 等泛名;按领域概念命名。
- **UI**:遵循 `docs/STYLEGUIDE.md` + `src/renderer/src/assets/main.css` token + `src/renderer/src/components/ui/` shadcn 原语;不自造颜色/字号。
- **注释**:只写"为什么",一到两行;不复述代码做什么。
- **提交**:每个任务末尾一次提交,message 用 `feat(acp)` / `feat(todo)` / `test(...)` 前缀。

---

## 文件结构(创建 / 修改)

**主进程(Phase A/B/C)**

- Modify `src/shared/acp/acp-session.ts` — `ACP_ENGINES` 加 `'cursor'`。
- Modify `src/main/acp/acp-agent-launcher.ts` — 加 `cursorSpec()`。
- Modify `src/main/acp/acp-connection-pool.ts` — cursor `authenticate` 握手。
- Modify `src/main/acp/acp-client.ts` — `extMethod` / `extNotification`(cursor 专有方法)。
- Modify `tests/mock-acp-agent.mjs` — cursor 扩展方法 + authenticate 支持。
- Modify `src/main/acp/acp-permission-bridge.ts` — 会话级 `auto`/`ask` 模式 + 超时。
- Modify `src/main/acp/acp-session-manager.ts` — 转发 `setPermissionMode`。
- Modify `src/main/ipc/acp.ts` — `acp:set-permission-mode` handler。
- Modify `src/preload/acp-api.ts` — `setPermissionMode`。
- Modify `src/main/todos/todo-database.ts` — SCHEMA v3:`default_working_dir`。
- Modify `src/shared/todo/todo-project.ts` — `defaultWorkingDir` + `UpdateTodoProjectInput`。
- Modify `src/main/todos/todo-row-mapping.ts` — 列映射。
- Modify `src/main/todos/todo-repository.ts` — 读写 `defaultWorkingDir` + `updateProject`。
- Modify `src/main/ipc/todos.ts` — `todos:projects:update`。
- Modify `src/preload/api-types.ts` — 类型贯穿(projects.update / defaultWorkingDir / acp.setPermissionMode)。

**渲染层(Phase D/E)**

- Create `src/shared/acp/session-event.ts` — `SessionEvent` / `PlanEntry` / `PermissionRequest` 联合类型。
- Create `src/renderer/src/store/slices/acp-session-event-mapping.ts` — 原始 sessionUpdate → `SessionEvent` 纯函数。
- Create `src/renderer/src/store/slices/acp.ts` — acp slice。
- Modify `src/renderer/src/store/index.ts` + `types.ts` — 注册 acp slice。
- Modify `src/renderer/src/store/slices/todos.ts` — 内页导航 + `updateTodoProject`。
- Create `src/renderer/src/components/todo/detail/session-event-item.tsx`
- Create `src/renderer/src/components/todo/detail/PlanChecklist.tsx`
- Create `src/renderer/src/components/todo/detail/PermissionRequestCard.tsx`
- Create `src/renderer/src/components/todo/detail/SessionConversation.tsx`
- Create `src/renderer/src/components/todo/detail/InProgressPanel.tsx`
- Create `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx`
- Create `src/renderer/src/components/todo/detail/TodoDetailView.tsx`
- Modify `src/renderer/src/components/todo/TodoPage.tsx` — 内页导航接线。

---

## Phase A — cursor ACP 引擎 + 鉴权 + 扩展方法

### Task A1: `ACP_ENGINES` 加入 cursor

**Files:**
- Modify: `src/shared/acp/acp-session.ts:2`
- Test: `src/shared/acp/acp-session.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

在 `src/shared/acp/acp-session.test.ts` 追加:

```ts
import { describe, it, expect } from 'vitest'
import { ACP_ENGINES, isAcpEngine } from './acp-session'

describe('cursor engine (P2b)', () => {
  it('includes cursor in ACP_ENGINES', () => {
    expect(ACP_ENGINES).toContain('cursor')
  })

  it('isAcpEngine recognizes cursor', () => {
    expect(isAcpEngine('cursor')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/shared/acp/acp-session.test.ts 2>&1 | tail -n 20`
预期:FAIL — `expected [ 'claude', 'qoder' ] to contain 'cursor'`。

- [ ] **Step 3: 最小实现**

`src/shared/acp/acp-session.ts` 第 2 行改为:

```ts
export const ACP_ENGINES = ['claude', 'qoder', 'cursor'] as const
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/shared/acp/acp-session.test.ts 2>&1 | tail -n 20`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/shared/acp/acp-session.ts src/shared/acp/acp-session.test.ts
git commit -m "feat(acp): add cursor to ACP_ENGINES"
```

---

### Task A2: launcher 加 `cursorSpec`

**Files:**
- Modify: `src/main/acp/acp-agent-launcher.ts:43-60`
- Test: `src/main/acp/acp-agent-launcher.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

追加(注意:mock 模式会短路,需临时关闭 `DMON_ACP_MOCK`):

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { getAgentLaunchSpec } from './acp-agent-launcher'

describe('cursorSpec (P2b)', () => {
  const prev = process.env.DMON_ACP_MOCK
  afterEach(() => {
    if (prev === undefined) delete process.env.DMON_ACP_MOCK
    else process.env.DMON_ACP_MOCK = prev
  })

  it('launches cursor as `agent acp`', () => {
    delete process.env.DMON_ACP_MOCK
    const spec = getAgentLaunchSpec('cursor')
    expect(spec.args).toEqual(['acp'])
    expect(spec.command).toContain('agent')
    expect(spec.env).toEqual({})
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-agent-launcher.test.ts 2>&1 | tail -n 20`
预期:FAIL — `Unknown ACP engine: cursor`(switch 未覆盖)。

- [ ] **Step 3: 最小实现**

`src/main/acp/acp-agent-launcher.ts`,在 `qoderSpec` 之后加:

```ts
// cursor 原生 ACP:二进制 `agent`,子命令 `acp`(沿用 resolveCliCommand 解析路径)。
function cursorSpec(): AgentLaunchSpec {
  return { command: resolveCliCommand('agent'), args: ['acp'], env: {} }
}
```

在 `getAgentLaunchSpec` 的 switch 中,`case 'qoder':` 之后加:

```ts
    case 'cursor':
      return cursorSpec()
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-agent-launcher.test.ts 2>&1 | tail -n 20`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/acp/acp-agent-launcher.ts src/main/acp/acp-agent-launcher.test.ts
git commit -m "feat(acp): add cursorSpec (agent acp) to launcher"
```

---

### Task A3: connection-pool cursor `authenticate` 握手

**Files:**
- Modify: `src/main/acp/acp-connection-pool.ts:27-29,80-107`
- Test: `src/main/acp/acp-connection-pool.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

参考现有 `fakeConnection()` 模式追加。目标:cursor 在 `initialize`(返回含 `cursor_login`)后调 `authenticate({methodId:'cursor_login'})`;claude/qoder 不调;`authMethods` 不含 `cursor_login` 时跳过。

```ts
import { describe, it, expect, vi } from 'vitest'
import { AcpConnectionPool, type ConnectResult } from './acp-connection-pool'
import type { AcpEngine } from '../../shared/acp/acp-session'

function makeConnect(initResult: unknown) {
  const authenticate = vi.fn(async () => ({}))
  const initialize = vi.fn(async () => initResult)
  const connect = (_engine: AcpEngine): ConnectResult => ({
    connection: {
      initialize,
      authenticate,
      newSession: vi.fn(),
      resumeSession: vi.fn(),
      loadSession: vi.fn(),
      prompt: vi.fn(),
      cancel: vi.fn()
    } as never,
    onExit: () => {},
    dispose: () => {}
  })
  return { connect, authenticate, initialize }
}

describe('cursor authenticate handshake (P2b)', () => {
  it('authenticates cursor when authMethods include cursor_login', async () => {
    const { connect, authenticate } = makeConnect({ authMethods: [{ id: 'cursor_login' }] })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('cursor')
    expect(authenticate).toHaveBeenCalledWith({ methodId: 'cursor_login' })
  })

  it('skips authenticate when cursor_login absent', async () => {
    const { connect, authenticate } = makeConnect({ authMethods: [] })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('cursor')
    expect(authenticate).not.toHaveBeenCalled()
  })

  it('never authenticates claude (zero regression)', async () => {
    const { connect, authenticate } = makeConnect({ authMethods: [{ id: 'cursor_login' }] })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('claude')
    expect(authenticate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-connection-pool.test.ts 2>&1 | tail -n 30`
预期:FAIL — cursor 用例 `authenticate` 未被调用。

- [ ] **Step 3: 最小实现**

`src/main/acp/acp-connection-pool.ts`,扩展 `PooledConnection` 类型(第 27-29 行):

```ts
type PooledConnection = AcpConnection & {
  initialize?: (params: unknown) => Promise<unknown>
  authenticate?: (params: { methodId: string }) => Promise<unknown>
}
```

在 `getAcpConnection` 里,把现有 `initialize` 调用块(第 99-105 行)替换为捕获返回值 + cursor 条件鉴权:

```ts
    if (typeof result.connection.initialize === 'function') {
      const initResult = (await result.connection.initialize({
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        clientInfo: { name: 'orca', version: '0' }
      })) as { authMethods?: { id: string }[] } | undefined
      // cursor 需在 initialize 后显式 authenticate,否则 newSession 因未鉴权被拒;
      // 其它引擎不含 cursor_login 时跳过,保持零回归。
      const methods = initResult?.authMethods ?? []
      if (
        engine === 'cursor' &&
        typeof result.connection.authenticate === 'function' &&
        methods.some((m) => m.id === 'cursor_login')
      ) {
        await result.connection.authenticate({ methodId: 'cursor_login' })
      }
    }
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-connection-pool.test.ts 2>&1 | tail -n 30`
预期:PASS(含既有用例)。

- [ ] **Step 5: 提交**

```bash
git add src/main/acp/acp-connection-pool.ts src/main/acp/acp-connection-pool.test.ts
git commit -m "feat(acp): authenticate cursor after initialize handshake"
```

---

### Task A4: OrcaAcpClient 处理 cursor 扩展方法

**Files:**
- Modify: `src/main/acp/acp-client.ts:15-24,26-64`
- Test: `src/main/acp/acp-client.test.ts`(已存在,追加用例)

> SDK 派发:未知**请求** → `client.extMethod(method, params)`;未知**通知** → `client.extNotification(method, params)`(见 `@agentclientprotocol/sdk/dist/acp.js:544,563`)。阻塞型请求必须应答否则 agent 挂起。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest'
import { OrcaAcpClient } from './acp-client'

function make() {
  const onSessionUpdate = vi.fn()
  const client = new OrcaAcpClient('cursor', {
    onSessionUpdate,
    requestPermission: vi.fn()
  })
  return { client, onSessionUpdate }
}

describe('cursor extension methods (P2b)', () => {
  it('answers blocking cursor/ask_question with empty default', async () => {
    const { client } = make()
    const res = await client.extMethod('cursor/ask_question', { sessionId: 's1' })
    expect(res).toBeDefined()
  })

  it('confirms blocking cursor/create_plan', async () => {
    const { client } = make()
    const res = await client.extMethod('cursor/create_plan', { sessionId: 's1' })
    expect(res).toBeDefined()
  })

  it('normalizes cursor/update_todos into a session update', async () => {
    const { client, onSessionUpdate } = make()
    await client.extNotification('cursor/update_todos', {
      sessionId: 's1',
      todos: [{ content: 'do X', status: 'pending' }]
    })
    expect(onSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1' })
    )
  })

  it('normalizes cursor/task into a session update', async () => {
    const { client, onSessionUpdate } = make()
    await client.extNotification('cursor/task', { sessionId: 's1', title: 't' })
    expect(onSessionUpdate).toHaveBeenCalled()
  })

  it('throws on unknown ext request (non-cursor)', async () => {
    const { client } = make()
    await expect(client.extMethod('foo/bar', {})).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-client.test.ts 2>&1 | tail -n 30`
预期:FAIL — `client.extMethod is not a function`。

- [ ] **Step 3: 最小实现**

`src/main/acp/acp-client.ts`,在类内 `writeTextFile` 之后加两个方法:

```ts
  // cursor 发送 ACP 标准之外的专有方法。阻塞型请求(ask_question / create_plan)
  // 不应答会让 agent 挂起,故这里以默认值兜底解除阻塞(UI 精细化留 P3)。
  async extMethod(method: string, params: unknown): Promise<unknown> {
    const sessionId = (params as { sessionId?: string } | undefined)?.sessionId
    switch (method) {
      case 'cursor/ask_question':
        // 默认空应答:不选任何选项,让会话继续。
        return {}
      case 'cursor/create_plan':
        // 默认确认计划草案。
        if (sessionId) {
          this.deps.onSessionUpdate({ sessionId, update: { sessionUpdate: 'plan', ...(params as object) } })
        }
        return { accepted: true }
      default:
        throw new Error(`Unknown ext method: ${method}`)
    }
  }

  // cursor 通知型方法:归一化后驱动 UI,无需应答。update_todos 复用为 plan 数据源。
  async extNotification(method: string, params: unknown): Promise<void> {
    const p = (params as { sessionId?: string }) ?? {}
    if (!p.sessionId) {
      return
    }
    if (method === 'cursor/update_todos') {
      this.deps.onSessionUpdate({
        sessionId: p.sessionId,
        update: { sessionUpdate: 'plan', ...(params as object) }
      })
      return
    }
    // cursor/task / cursor/generate_image 等:原样归一化为普通事件。
    this.deps.onSessionUpdate({
      sessionId: p.sessionId,
      update: { sessionUpdate: 'ext', method, params }
    })
  }
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-client.test.ts 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/acp/acp-client.ts src/main/acp/acp-client.test.ts
git commit -m "feat(acp): handle cursor ext methods (ask_question/create_plan/update_todos)"
```

---

### Task A5: mock agent 支持 cursor 扩展方法 + authenticate

**Files:**
- Modify: `tests/mock-acp-agent.mjs:10-12,47-78`
- Test: 由 A3/A4 覆盖;本任务不新增测试,靠 typecheck + 现有 smoke 测试保证不回归。

- [ ] **Step 1: 加 authenticate + cursor 扩展触发**

在 `makeAgent` 返回对象内,`initialize` 之后加 `authenticate`,并在 `prompt` 里对 `CURSOR_EXT_TEST` 触发扩展请求/通知:

```js
    async authenticate() {
      return {}
    },
```

在 `prompt` 的 `if (text.includes('PERMISSION_TEST'))` 块之后加:

```js
      if (text.includes('CURSOR_EXT_TEST')) {
        // 通知型:驱动 plan(update_todos)。
        conn.extNotification?.('cursor/update_todos', {
          sessionId,
          todos: [{ content: 'mock todo', status: 'pending' }]
        })
        // 阻塞型请求:等待 client 兜底应答。
        await conn.extMethod?.('cursor/create_plan', { sessionId, entries: [] })
      }
```

> 注:`AgentSideConnection` 是否暴露 `extMethod`/`extNotification` 取决于 SDK 版本;若不可用,mock 里可退化为直接 `conn.sessionUpdate({ sessionId, update: { sessionUpdate: 'plan', ... } })` 模拟通知效果。真实 cursor 分支已由 A4 单测独立覆盖,mock 仅为 smoke。

- [ ] **Step 2: 运行既有 smoke,确认不回归**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/mock-acp-agent.smoke.test.ts 2>&1 | tail -n 20`
预期:PASS。

- [ ] **Step 3: 提交**

```bash
git add tests/mock-acp-agent.mjs
git commit -m "test(acp): mock agent supports authenticate + cursor ext trigger"
```

---

## Phase B — 会话级权限模式 + IPC

### Task B1: permission-bridge 加 auto/ask 模式 + 超时

**Files:**
- Modify: `src/main/acp/acp-permission-bridge.ts:13-71`
- Test: `src/main/acp/acp-permission-bridge.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest'
import { AcpPermissionBridge } from './acp-permission-bridge'

describe('permission modes (P2b)', () => {
  it('auto mode resolves immediately with first allow option', async () => {
    const bridge = new AcpPermissionBridge(() => {})
    const outcome = await bridge.requestPermission('s1', {
      options: [
        { optionId: 'reject-once', name: 'Deny', kind: 'reject_once' },
        { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }
      ],
      toolCall: { toolCallId: 'tc', title: 't' }
    })
    expect(outcome).toEqual({ outcome: 'selected', optionId: 'allow-once' })
  })

  it('ask mode suspends until resolvePermission', async () => {
    const broadcast = vi.fn()
    const bridge = new AcpPermissionBridge(broadcast)
    bridge.setPermissionMode('s1', 'ask')
    const p = bridge.requestPermission('s1', {
      options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
      toolCall: { toolCallId: 'tc', title: 't' }
    })
    // 取 broadcast 出去的 requestId。
    const call = broadcast.mock.calls.find((c) => c[0] === 'acp:permission-request')
    const requestId = (call?.[1] as { requestId: string }).requestId
    bridge.resolvePermission(requestId, 'allow-once')
    await expect(p).resolves.toEqual({ outcome: 'selected', optionId: 'allow-once' })
  })

  it('ask mode times out to cancelled', async () => {
    vi.useFakeTimers()
    const bridge = new AcpPermissionBridge(() => {}, { askTimeoutMs: 1000 })
    bridge.setPermissionMode('s1', 'ask')
    const p = bridge.requestPermission('s1', {
      options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
      toolCall: { toolCallId: 'tc', title: 't' }
    })
    vi.advanceTimersByTime(1000)
    await expect(p).resolves.toEqual({ outcome: 'cancelled' })
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-permission-bridge.test.ts 2>&1 | tail -n 30`
预期:FAIL — `setPermissionMode is not a function` / ask 用例立即放行。

- [ ] **Step 3: 最小实现**

`src/main/acp/acp-permission-bridge.ts` 全量改造:

```ts
type PermissionOption = { optionId: string; name: string; kind: string }
type RequestPermissionParams = {
  options: PermissionOption[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

export type PermissionOutcome =
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' }

export type PermissionMode = 'auto' | 'ask'

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

type PendingEntry = {
  sessionId: string
  resolve: (o: PermissionOutcome) => void
  timer?: ReturnType<typeof setTimeout>
}

let requestSeq = 0
const DEFAULT_ASK_TIMEOUT_MS = 120_000

function firstAllowOptionId(options: PermissionOption[]): string | undefined {
  const allow = options.find((o) => o.kind.startsWith('allow'))
  return (allow ?? options[0])?.optionId
}

export class AcpPermissionBridge {
  private pending = new Map<string, PendingEntry>()
  private modeBySession = new Map<string, PermissionMode>()
  private readonly autoAllow: boolean
  private readonly askTimeoutMs: number

  constructor(
    private readonly broadcast: BroadcastFn,
    opts: { autoAllow?: boolean; askTimeoutMs?: number } = {}
  ) {
    this.autoAllow = opts.autoAllow ?? true
    this.askTimeoutMs = opts.askTimeoutMs ?? DEFAULT_ASK_TIMEOUT_MS
  }

  setPermissionMode(sessionId: string, mode: PermissionMode): void {
    this.modeBySession.set(sessionId, mode)
  }

  private modeFor(sessionId: string): PermissionMode {
    return this.modeBySession.get(sessionId) ?? (this.autoAllow ? 'auto' : 'ask')
  }

  requestPermission(
    sessionId: string,
    params: RequestPermissionParams
  ): Promise<PermissionOutcome> {
    const requestId = `perm-${++requestSeq}`
    return new Promise<PermissionOutcome>((resolve) => {
      const entry: PendingEntry = { sessionId, resolve }
      this.pending.set(requestId, entry)
      this.broadcast('acp:permission-request', { requestId, sessionId, params }, sessionId)
      if (this.modeFor(sessionId) === 'auto') {
        const optionId = firstAllowOptionId(params.options)
        if (optionId) {
          this.resolvePermission(requestId, optionId)
        }
        return
      }
      // ask 模式:挂起,超时默认拒绝并清理,避免 agent 永久阻塞。
      entry.timer = setTimeout(() => {
        if (this.pending.delete(requestId)) {
          resolve({ outcome: 'cancelled' })
        }
      }, this.askTimeoutMs)
    })
  }

  resolvePermission(requestId: string, optionId: string): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) {
      return false
    }
    this.pending.delete(requestId)
    if (entry.timer) {
      clearTimeout(entry.timer)
    }
    entry.resolve({ outcome: 'selected', optionId })
    return true
  }

  rejectAllForSession(sessionId: string): void {
    for (const [id, entry] of this.pending.entries()) {
      if (entry.sessionId === sessionId) {
        this.pending.delete(id)
        if (entry.timer) {
          clearTimeout(entry.timer)
        }
        entry.resolve({ outcome: 'cancelled' })
      }
    }
  }
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-permission-bridge.test.ts 2>&1 | tail -n 30`
预期:PASS(含既有 auto/resolve/rejectAll 用例)。

- [ ] **Step 5: 提交**

```bash
git add src/main/acp/acp-permission-bridge.ts src/main/acp/acp-permission-bridge.test.ts
git commit -m "feat(acp): session-level auto/ask permission mode with ask timeout"
```

---

### Task B2: session-manager 转发 setPermissionMode

**Files:**
- Modify: `src/main/acp/acp-session-manager.ts:32-36,49-55`
- Test: `src/main/acp/acp-session-manager.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

```ts
it('setPermissionMode delegates to permissionBridge (P2b)', () => {
  const setPermissionMode = vi.fn()
  const manager = new AcpSessionManager({
    // ...(复用测试文件既有的 makeDeps 工厂;补一个 permissionBridge.setPermissionMode)
    permissionBridge: {
      requestPermission: vi.fn(),
      resolvePermission: vi.fn(),
      rejectAllForSession: vi.fn(),
      setPermissionMode
    }
  } as never)
  manager.setPermissionMode('s1', 'ask')
  expect(setPermissionMode).toHaveBeenCalledWith('s1', 'ask')
})
```

> 若测试文件已有 `makeDeps`/`fakeBridge`,给其 bridge 加 `setPermissionMode: vi.fn()` 以免类型报错。

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-manager.test.ts 2>&1 | tail -n 30`
预期:FAIL — `manager.setPermissionMode is not a function`。

- [ ] **Step 3: 最小实现**

`src/main/acp/acp-session-manager.ts`,`PermissionBridgeLike` 类型加一行:

```ts
type PermissionBridgeLike = {
  requestPermission: (sessionId: string, params: unknown) => Promise<unknown>
  resolvePermission: (requestId: string, optionId: string) => boolean
  rejectAllForSession: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: 'auto' | 'ask') => void
}
```

类内 `listSessions` 之后加:

```ts
  setPermissionMode(sessionId: string, mode: 'auto' | 'ask'): void {
    this.deps.permissionBridge.setPermissionMode(sessionId, mode)
  }
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-manager.test.ts 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/acp/acp-session-manager.ts src/main/acp/acp-session-manager.test.ts
git commit -m "feat(acp): session-manager forwards setPermissionMode"
```

---

### Task B3: IPC `acp:set-permission-mode`

**Files:**
- Modify: `src/main/ipc/acp.ts:7-20,26-45`
- Test: `src/main/ipc/acp.test.ts`(已存在,追加用例;若无则新建)

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest'
import { registerAcpHandlers } from './acp'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>()
  return {
    handle: (ch: string, fn: (e: unknown, arg: never) => unknown) =>
      handlers.set(ch, fn as never),
    invoke: (ch: string, arg: unknown) => handlers.get(ch)?.({}, arg)
  }
}

it('acp:set-permission-mode calls sessionManager (P2b)', () => {
  const setPermissionMode = vi.fn()
  const ipc = fakeIpc()
  registerAcpHandlers(
    {
      executeRouter: { executeEnginePrompt: vi.fn() },
      sessionManager: {
        cancelSession: vi.fn(),
        listSessions: vi.fn(),
        loadHistory: vi.fn(),
        setPermissionMode
      },
      permissionBridge: { resolvePermission: vi.fn() }
    } as never,
    ipc as never
  )
  ipc.invoke('acp:set-permission-mode', { sessionId: 's1', mode: 'ask' })
  expect(setPermissionMode).toHaveBeenCalledWith('s1', 'ask')
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/ipc/acp.test.ts 2>&1 | tail -n 20`
预期:FAIL — handler 未注册(invoke 返回 undefined,setPermissionMode 未被调)。

- [ ] **Step 3: 最小实现**

`src/main/ipc/acp.ts`,`SessionManagerLike` 加方法:

```ts
type SessionManagerLike = {
  cancelSession: (sessionId: string) => Promise<{ ok: boolean }>
  listSessions: (taskId: string) => unknown[]
  loadHistory: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: 'auto' | 'ask') => void
}
```

在 `acp:load-history` handler 之后加:

```ts
  ipcMain.handle(
    'acp:set-permission-mode',
    (_e, arg: { sessionId: string; mode: 'auto' | 'ask' }) => {
      deps.sessionManager.setPermissionMode(arg.sessionId, arg.mode)
      return { ok: true }
    }
  )
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/ipc/acp.test.ts 2>&1 | tail -n 20`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/ipc/acp.ts src/main/ipc/acp.test.ts
git commit -m "feat(acp): add acp:set-permission-mode IPC handler"
```

---

### Task B4: preload 暴露 setPermissionMode + 类型

**Files:**
- Modify: `src/preload/acp-api.ts:19-40`
- Modify: `src/preload/api-types.ts`(`AcpApi` 由 `ReturnType` 推导,无需手改;仅确认 typecheck)

- [ ] **Step 1: 加 API 方法**

`src/preload/acp-api.ts`,在 `loadHistory` 之后加:

```ts
    setPermissionMode: (arg: { sessionId: string; mode: 'auto' | 'ask' }) =>
      ipc.invoke('acp:set-permission-mode', arg),
```

- [ ] **Step 2: typecheck**

运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:无新增错误(`AcpApi = ReturnType<typeof createAcpApi>` 自动含新方法)。

- [ ] **Step 3: 提交**

```bash
git add src/preload/acp-api.ts
git commit -m "feat(acp): expose window.api.acp.setPermissionMode"
```

---

## Phase C — 项目默认工作目录(迁移 + 类型贯穿)

### Task C1: todo-database SCHEMA v3 迁移

**Files:**
- Modify: `src/main/todos/todo-database.ts:6,92-110`
- Test: `src/main/todos/todo-database.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

```ts
it('migrates todo_projects with default_working_dir (v3, P2b)', () => {
  const db = new TodoDatabase(':memory:')
  const cols = db.raw.pragma('table_info(todo_projects)') as { name: string }[]
  expect(cols.some((c) => c.name === 'default_working_dir')).toBe(true)
  expect(db.raw.pragma('user_version', { simple: true })).toBe(3)
  db.close()
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/todos/todo-database.test.ts 2>&1 | tail -n 20`
预期:FAIL — 列不存在 / user_version 为 2。

- [ ] **Step 3: 最小实现**

`src/main/todos/todo-database.ts`:
1. 第 6 行 `export const SCHEMA_VERSION = 3`。
2. `ensureSchema` 的 `CREATE TABLE IF NOT EXISTS todo_projects` 里,`updated_at TEXT NOT NULL` 之后加一列(新库直建):

```sql
        updated_at TEXT NOT NULL,
        default_working_dir TEXT
```

3. `migrate()` 事务内,`v2` 块之后加 `v3`:

```ts
      // v3: 项目级默认工作目录,新任务继承 / 启动弹窗预填。
      if (current < 3 && !this.hasColumn('todo_projects', 'default_working_dir')) {
        this.db.exec('ALTER TABLE todo_projects ADD COLUMN default_working_dir TEXT')
      }
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/todos/todo-database.test.ts 2>&1 | tail -n 20`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/todos/todo-database.ts src/main/todos/todo-database.test.ts
git commit -m "feat(todo): schema v3 adds todo_projects.default_working_dir"
```

---

### Task C2: TodoProject 类型 + UpdateTodoProjectInput

**Files:**
- Modify: `src/shared/todo/todo-project.ts`

- [ ] **Step 1: 改类型**

`src/shared/todo/todo-project.ts` 全量:

```ts
export type TodoProject = {
  id: string
  name: string
  identifierPrefix: string
  nextSequence: number
  defaultWorkingDir: string | null
  createdAt: string
  updatedAt: string
}

export type CreateTodoProjectInput = {
  name: string
  identifierPrefix: string
}

export type RenameTodoProjectInput = {
  id: string
  name: string
}

export type UpdateTodoProjectInput = {
  id: string
  defaultWorkingDir?: string | null
}
```

- [ ] **Step 2: typecheck(预期报错,下游任务修复)**

运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:`rowToProject` / repo 缺 `defaultWorkingDir` 报错 —— 由 C3/C4 修复。**本任务先只提交类型定义。**

- [ ] **Step 3: 提交**

```bash
git add src/shared/todo/todo-project.ts
git commit -m "feat(todo): add defaultWorkingDir + UpdateTodoProjectInput types"
```

---

### Task C3: row-mapping 映射 default_working_dir

**Files:**
- Modify: `src/main/todos/todo-row-mapping.ts:9-16,46-55`
- Test: `src/main/todos/todo-row-mapping.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

```ts
it('maps default_working_dir on projects (P2b)', () => {
  const project = rowToProject({
    id: 'p1',
    name: 'P',
    identifier_prefix: 'P',
    next_sequence: 1,
    default_working_dir: '/tmp/work',
    created_at: 't',
    updated_at: 't'
  })
  expect(project.defaultWorkingDir).toBe('/tmp/work')
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/todos/todo-row-mapping.test.ts 2>&1 | tail -n 20`
预期:FAIL(类型/值不匹配)。

- [ ] **Step 3: 最小实现**

`TodoProjectRow` 加字段:

```ts
export type TodoProjectRow = {
  id: string
  name: string
  identifier_prefix: string
  next_sequence: number
  default_working_dir: string | null
  created_at: string
  updated_at: string
}
```

`rowToProject` 加映射:

```ts
export function rowToProject(row: TodoProjectRow): TodoProject {
  return {
    id: row.id,
    name: row.name,
    identifierPrefix: row.identifier_prefix,
    nextSequence: row.next_sequence,
    defaultWorkingDir: row.default_working_dir,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/todos/todo-row-mapping.test.ts 2>&1 | tail -n 20`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/todos/todo-row-mapping.ts src/main/todos/todo-row-mapping.test.ts
git commit -m "feat(todo): map default_working_dir in rowToProject"
```

---

### Task C4: repository 读写 defaultWorkingDir + updateProject

**Files:**
- Modify: `src/main/todos/todo-repository.ts:3-12,64-85`
- Test: `src/main/todos/todo-repository.test.ts`(已存在,追加用例)

- [ ] **Step 1: 写失败测试**

```ts
it('createProject defaults defaultWorkingDir to null (P2b)', () => {
  const p = repo.createProject({ name: 'P', identifierPrefix: 'P' })
  expect(p.defaultWorkingDir).toBeNull()
})

it('updateProject writes defaultWorkingDir (P2b)', () => {
  const p = repo.createProject({ name: 'P', identifierPrefix: 'P' })
  const updated = repo.updateProject({ id: p.id, defaultWorkingDir: '/tmp/w' })
  expect(updated.defaultWorkingDir).toBe('/tmp/w')
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/todos/todo-repository.test.ts 2>&1 | tail -n 30`
预期:FAIL — `updateProject is not a function`。

- [ ] **Step 3: 最小实现**

import 加 `UpdateTodoProjectInput`:

```ts
import type {
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  UpdateTodoProjectInput,
  TodoProject
} from '../../shared/todo/todo-project'
```

`createProject` 的 INSERT 保持不变(`default_working_dir` 默认 NULL,列可空,无需显式列)。在 `renameProject` 之后加 `updateProject`:

```ts
  updateProject(input: UpdateTodoProjectInput): TodoProject {
    if (input.defaultWorkingDir !== undefined) {
      this.db
        .prepare('UPDATE todo_projects SET default_working_dir = ?, updated_at = ? WHERE id = ?')
        .run(input.defaultWorkingDir, nowIso(), input.id)
    }
    return this.requireProject(input.id)
  }
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/todos/todo-repository.test.ts 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/main/todos/todo-repository.ts src/main/todos/todo-repository.test.ts
git commit -m "feat(todo): repository updateProject writes defaultWorkingDir"
```

---

### Task C5: IPC todos:projects:update + preload + 类型

**Files:**
- Modify: `src/main/ipc/todos.ts:4,11-20`
- Modify: `src/preload/index.ts`(todos.projects 暴露 update — 定位现有 projects 块)
- Modify: `src/preload/api-types.ts:3082-3103`
- Test: `src/main/ipc/todos.test.ts`(若存在则追加;否则靠 typecheck)

- [ ] **Step 1: IPC handler**

`src/main/ipc/todos.ts` import 加 `UpdateTodoProjectInput`:

```ts
import type {
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  UpdateTodoProjectInput
} from '../../shared/todo/todo-project'
```

`todos:projects:rename` 之后加:

```ts
  ipcMain.handle('todos:projects:update', (_event, input: UpdateTodoProjectInput) =>
    repo.updateProject(input)
  )
```

- [ ] **Step 2: preload 暴露**

`src/preload/index.ts` 的 `todos.projects` 对象里(与 `rename` 并列)加:

```ts
      update: (input: UpdateTodoProjectInput) =>
        ipcRenderer.invoke('todos:projects:update', input),
```

> 记得在 `src/preload/index.ts` 顶部 import `UpdateTodoProjectInput`(若该文件按类型集中 import,加到对应处)。

- [ ] **Step 3: api-types**

`src/preload/api-types.ts` 的 `todos.projects` 块(第 3083-3088 行)加:

```ts
      update: (input: UpdateTodoProjectInput) => Promise<TodoProject>
```

并确认文件顶部已 import `UpdateTodoProjectInput`(与 `CreateTodoProjectInput` 同处)。

- [ ] **Step 4: typecheck**

运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:无错误(Phase C 类型贯穿闭合)。

- [ ] **Step 5: 提交**

```bash
git add src/main/ipc/todos.ts src/preload/index.ts src/preload/api-types.ts
git commit -m "feat(todo): todos:projects:update IPC + preload + types"
```

---

## Phase D — acp slice + 事件归一化

> **关键契约**:P2a 中**实时流**走 `acp:session-update:{sid}`(connection-pool 广播),而**历史重放**走 `acp:update:{sid}`(session-manager.loadHistory)。preload 现仅暴露 `onUpdate`(=`acp:update`),**遗漏实时流**。Task D2 补 `onSessionUpdate`;slice 同时订阅两者喂进同一归一化管线。

### Task D1: 共享 SessionEvent 类型 + 归一化纯函数

**Files:**
- Create: `src/shared/acp/session-event.ts`
- Create: `src/renderer/src/store/slices/acp-session-event-mapping.ts`
- Test: `src/renderer/src/store/slices/acp-session-event-mapping.test.ts`

- [ ] **Step 1: 写共享类型**

`src/shared/acp/session-event.ts`:

```ts
// 渲染层只认这套归一化结构;P3 对话验证直接复用。
export type SessionEvent =
  | { kind: 'agent_message'; text: string }
  | { kind: 'user_message'; text: string }
  | { kind: 'thought'; text: string }
  | {
      kind: 'tool_call'
      toolCallId: string
      title: string
      status?: string
      toolKind?: string
      rawInput?: unknown
      content?: unknown
    }
  | { kind: 'ext'; method: string; params: unknown }

export type PlanEntry = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: string
}

export type PermissionRequestOption = { optionId: string; name: string; kind: string }

export type PermissionRequest = {
  requestId: string
  sessionId: string
  options: PermissionRequestOption[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

export type MappedUpdate =
  | { type: 'event'; event: SessionEvent }
  | { type: 'plan'; entries: PlanEntry[] }
  | { type: 'ignore' }
```

- [ ] **Step 2: 写失败测试**

`src/renderer/src/store/slices/acp-session-event-mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapSessionUpdate } from './acp-session-event-mapping'

describe('mapSessionUpdate', () => {
  it('maps agent_message_chunk', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hi' } })
    ).toEqual({ type: 'event', event: { kind: 'agent_message', text: 'hi' } })
  })

  it('maps agent_thought_chunk', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'mm' } })
    ).toEqual({ type: 'event', event: { kind: 'thought', text: 'mm' } })
  })

  it('maps user_message_chunk', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'q' } })
    ).toEqual({ type: 'event', event: { kind: 'user_message', text: 'q' } })
  })

  it('maps tool_call', () => {
    const r = mapSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'tc1',
      title: 'edit',
      status: 'pending',
      kind: 'edit'
    })
    expect(r).toEqual({
      type: 'event',
      event: { kind: 'tool_call', toolCallId: 'tc1', title: 'edit', status: 'pending', toolKind: 'edit', rawInput: undefined, content: undefined }
    })
  })

  it('maps standard plan entries', () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: 'plan',
        entries: [{ content: 'a', status: 'pending', priority: 'high' }]
      })
    ).toEqual({ type: 'plan', entries: [{ content: 'a', status: 'pending', priority: 'high' }] })
  })

  it('maps cursor update_todos (synthesized plan with todos)', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'plan', todos: [{ content: 'x', status: 'in_progress' }] })
    ).toEqual({ type: 'plan', entries: [{ content: 'x', status: 'in_progress' }] })
  })

  it('maps ext (cursor/task)', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'ext', method: 'cursor/task', params: { title: 't' } })
    ).toEqual({ type: 'event', event: { kind: 'ext', method: 'cursor/task', params: { title: 't' } } })
  })

  it('ignores current_mode_update', () => {
    expect(mapSessionUpdate({ sessionUpdate: 'current_mode_update' })).toEqual({ type: 'ignore' })
  })
})
```

- [ ] **Step 3: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/acp-session-event-mapping.test.ts 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 4: 最小实现**

`src/renderer/src/store/slices/acp-session-event-mapping.ts`:

```ts
import type { MappedUpdate, PlanEntry } from '../../../../shared/acp/session-event'

type ChunkContent = { type?: string; text?: string }
type RawUpdate = {
  sessionUpdate?: string
  content?: ChunkContent
  toolCallId?: string
  title?: string
  status?: string
  kind?: string
  rawInput?: unknown
  entries?: { content: string; status: string; priority?: string }[]
  todos?: { content: string; status: string; priority?: string }[]
  method?: string
  params?: unknown
}

function textOf(c: ChunkContent | undefined): string {
  return c?.text ?? ''
}

function toPlanEntries(
  raw: { content: string; status: string; priority?: string }[]
): PlanEntry[] {
  return raw.map((e) => ({
    content: e.content,
    status: (e.status as PlanEntry['status']) ?? 'pending',
    ...(e.priority !== undefined ? { priority: e.priority } : {})
  }))
}

// 原始 ACP sessionUpdate → 渲染层归一化结构。cursor 专有(update_todos→plan;
// task/generate_image→ext)已在主进程 client 归一到同一形状,这里统一处理。
export function mapSessionUpdate(update: unknown): MappedUpdate {
  const u = (update ?? {}) as RawUpdate
  switch (u.sessionUpdate) {
    case 'agent_message_chunk':
      return { type: 'event', event: { kind: 'agent_message', text: textOf(u.content) } }
    case 'agent_thought_chunk':
      return { type: 'event', event: { kind: 'thought', text: textOf(u.content) } }
    case 'user_message_chunk':
      return { type: 'event', event: { kind: 'user_message', text: textOf(u.content) } }
    case 'tool_call':
    case 'tool_call_update':
      return {
        type: 'event',
        event: {
          kind: 'tool_call',
          toolCallId: u.toolCallId ?? '',
          title: u.title ?? '',
          status: u.status,
          toolKind: u.kind,
          rawInput: u.rawInput,
          content: u.content
        }
      }
    case 'plan':
      return { type: 'plan', entries: toPlanEntries(u.entries ?? u.todos ?? []) }
    case 'ext':
      return {
        type: 'event',
        event: { kind: 'ext', method: u.method ?? '', params: u.params }
      }
    default:
      return { type: 'ignore' }
  }
}
```

- [ ] **Step 5: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/acp-session-event-mapping.test.ts 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 6: 提交**

```bash
git add src/shared/acp/session-event.ts src/renderer/src/store/slices/acp-session-event-mapping.ts src/renderer/src/store/slices/acp-session-event-mapping.test.ts
git commit -m "feat(acp): SessionEvent types + sessionUpdate normalization"
```

---

### Task D2: preload 补 onSessionUpdate(实时流通道)

**Files:**
- Modify: `src/preload/acp-api.ts:28-38`

- [ ] **Step 1: 加订阅方法**

`src/preload/acp-api.ts`,在 `onUpdate` 之后加(实时流是 `acp:session-update`,history 重放是 `acp:update`):

```ts
    onSessionUpdate: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:session-update:${sessionId}`, cb),
```

- [ ] **Step 2: typecheck**

运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:无错误(`AcpApi` 自动含新方法)。

- [ ] **Step 3: 提交**

```bash
git add src/preload/acp-api.ts
git commit -m "feat(acp): preload onSessionUpdate for live streaming channel"
```

---

### Task D3: acp slice(会话运行态 + 订阅 + 动作)

**Files:**
- Create: `src/renderer/src/store/slices/acp.ts`
- Test: `src/renderer/src/store/slices/acp.test.ts`

> 说明:该 slice 独立管理"当前详情任务的会话运行态",不塞进 todos slice。订阅按 sessionId 建立(`subscribeSession`),内部对 update / session-update / complete / error / permission-request 归一化写状态。

- [ ] **Step 1: 写失败测试**

`src/renderer/src/store/slices/acp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAcpSlice, type AcpSlice } from './acp'

function makeStore() {
  let state: AcpSlice
  const set = (partial: Partial<AcpSlice> | ((s: AcpSlice) => Partial<AcpSlice>)) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
  }
  const get = (): AcpSlice => state
  state = createAcpSlice(set as never, get as never, {} as never)
  return { get, set }
}

const listeners: Record<string, ((p: unknown) => void)[]> = {}
function emit(channel: string, sid: string, payload: unknown) {
  for (const cb of listeners[`${channel}:${sid}`] ?? []) cb(payload)
}

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k]
  ;(globalThis as { window?: unknown }).window = {
    api: {
      acp: {
        execute: vi.fn(async () => ({ sessionId: 's1' })),
        cancel: vi.fn(async () => ({ ok: true })),
        listSessions: vi.fn(async () => []),
        loadHistory: vi.fn(),
        resolvePermission: vi.fn(async () => ({ ok: true })),
        setPermissionMode: vi.fn(async () => ({ ok: true })),
        onSessionUpdate: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:session-update:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onUpdate: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:update:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onComplete: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:complete:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onError: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:error:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onPermissionRequest: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:permission-request:${sid}`] ??= []).push(cb)
          return () => {}
        },
        onSessionReady: (sid: string, cb: (p: unknown) => void) => {
          ;(listeners[`acp:session-ready:${sid}`] ??= []).push(cb)
          return () => {}
        }
      }
    }
  }
})

describe('acp slice', () => {
  it('executeTask stores sessionId as active and subscribes', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    expect(get().activeSessionByTask.t1).toBe('s1')
  })

  it('live session-update appends normalized event', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:session-update', 's1', {
      sessionId: 's1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hey' } }
    })
    expect(get().eventsBySession.s1).toEqual([{ kind: 'agent_message', text: 'hey' }])
  })

  it('plan update writes planBySession', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:session-update', 's1', {
      sessionId: 's1',
      update: { sessionUpdate: 'plan', entries: [{ content: 'a', status: 'pending' }] }
    })
    expect(get().planBySession.s1).toEqual([{ content: 'a', status: 'pending' }])
  })

  it('permission-request adds pending request', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:permission-request', 's1', {
      requestId: 'r1',
      sessionId: 's1',
      params: { options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }], toolCall: { toolCallId: 'tc', title: 't' } }
    })
    expect(get().permissionRequestsBySession.s1?.[0]?.requestId).toBe('r1')
  })

  it('complete sets session status and clears pending permissions', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:complete', 's1', { sessionId: 's1', stopReason: 'end_turn' })
    expect(get().sessionStatusBySession.s1).toBe('complete')
  })

  it('resolvePermission removes the request and calls IPC', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    emit('acp:permission-request', 's1', {
      requestId: 'r1',
      sessionId: 's1',
      params: { options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }], toolCall: { toolCallId: 'tc', title: 't' } }
    })
    await get().resolvePermission('s1', 'r1', 'allow-once')
    expect(window.api.acp.resolvePermission).toHaveBeenCalledWith({ requestId: 'r1', optionId: 'allow-once' })
    expect(get().permissionRequestsBySession.s1).toEqual([])
  })

  it('setPermissionMode updates state and calls IPC', async () => {
    const { get } = makeStore()
    await get().executeTask({ taskId: 't1', engine: 'cursor', prompt: 'p', cwd: '/w' })
    await get().setPermissionMode('s1', 'ask')
    expect(get().permissionModeBySession.s1).toBe('ask')
    expect(window.api.acp.setPermissionMode).toHaveBeenCalledWith({ sessionId: 's1', mode: 'ask' })
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/acp.test.ts 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/store/slices/acp.ts`:

```ts
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { AcpEngine } from '../../../../shared/acp/acp-session'
import type {
  PermissionRequest,
  PlanEntry,
  SessionEvent
} from '../../../../shared/acp/session-event'
import { mapSessionUpdate } from './acp-session-event-mapping'

export type AcpSessionStatus = 'running' | 'complete' | 'error' | 'canceled'
type PermissionMode = 'auto' | 'ask'

export type ExecuteTaskInput = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  resumeSessionId?: string
}

export type AcpSlice = {
  activeSessionByTask: Record<string, string | null>
  eventsBySession: Record<string, SessionEvent[]>
  planBySession: Record<string, PlanEntry[]>
  permissionRequestsBySession: Record<string, PermissionRequest[]>
  permissionModeBySession: Record<string, PermissionMode>
  sessionStatusBySession: Record<string, AcpSessionStatus>

  executeTask: (input: ExecuteTaskInput) => Promise<string>
  sendFollowUp: (taskId: string, engine: AcpEngine, cwd: string, text: string) => Promise<void>
  cancelSession: (sessionId: string) => Promise<void>
  loadSessions: (taskId: string) => Promise<void>
  loadHistory: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>
  resolvePermission: (sessionId: string, requestId: string, optionId: string) => Promise<void>
  subscribeSession: (sessionId: string, taskId: string) => void
}

export const createAcpSlice: StateCreator<AppState, [], [], AcpSlice> = (set, get) => {
  const subscribed = new Set<string>()

  const appendEvent = (sessionId: string, event: SessionEvent): void =>
    set((s) => ({
      eventsBySession: {
        ...s.eventsBySession,
        [sessionId]: [...(s.eventsBySession[sessionId] ?? []), event]
      }
    }))

  const ingestUpdate = (sessionId: string, payload: unknown): void => {
    const update = (payload as { update?: unknown })?.update ?? payload
    const mapped = mapSessionUpdate(update)
    if (mapped.type === 'event') {
      appendEvent(sessionId, mapped.event)
    } else if (mapped.type === 'plan') {
      set((s) => ({ planBySession: { ...s.planBySession, [sessionId]: mapped.entries } }))
    }
  }

  return {
    activeSessionByTask: {},
    eventsBySession: {},
    planBySession: {},
    permissionRequestsBySession: {},
    permissionModeBySession: {},
    sessionStatusBySession: {},

    subscribeSession: (sessionId, _taskId) => {
      if (subscribed.has(sessionId)) {
        return
      }
      subscribed.add(sessionId)
      const acp = window.api.acp
      acp.onSessionUpdate(sessionId, (p) => ingestUpdate(sessionId, p))
      acp.onUpdate(sessionId, (p) => ingestUpdate(sessionId, p))
      acp.onComplete(sessionId, () =>
        set((s) => ({
          sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'complete' },
          permissionRequestsBySession: { ...s.permissionRequestsBySession, [sessionId]: [] }
        }))
      )
      acp.onError(sessionId, () =>
        set((s) => ({
          sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'error' }
        }))
      )
      acp.onPermissionRequest(sessionId, (p) => {
        const req = p as { requestId: string; sessionId: string; params: PermissionRequest }
        const request: PermissionRequest = {
          requestId: req.requestId,
          sessionId,
          options: req.params.options,
          toolCall: req.params.toolCall
        }
        set((s) => ({
          permissionRequestsBySession: {
            ...s.permissionRequestsBySession,
            [sessionId]: [...(s.permissionRequestsBySession[sessionId] ?? []), request]
          }
        }))
      })
    },

    executeTask: async (input) => {
      const { sessionId } = (await window.api.acp.execute(input)) as { sessionId: string }
      get().subscribeSession(sessionId, input.taskId)
      set((s) => ({
        activeSessionByTask: { ...s.activeSessionByTask, [input.taskId]: sessionId },
        sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'running' }
      }))
      return sessionId
    },

    sendFollowUp: async (taskId, engine, cwd, text) => {
      const resumeSessionId = get().activeSessionByTask[taskId] ?? undefined
      await get().executeTask({ taskId, engine, prompt: text, cwd, resumeSessionId })
    },

    cancelSession: async (sessionId) => {
      await window.api.acp.cancel({ sessionId })
      set((s) => ({
        sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'canceled' }
      }))
    },

    loadSessions: async (taskId) => {
      const sessions = (await window.api.acp.listSessions({ taskId })) as { sessionId: string }[]
      const active = sessions[sessions.length - 1]?.sessionId ?? null
      if (active) {
        get().subscribeSession(active, taskId)
      }
      set((s) => ({ activeSessionByTask: { ...s.activeSessionByTask, [taskId]: active } }))
    },

    loadHistory: (sessionId) => {
      window.api.acp.loadHistory({ sessionId })
    },

    setPermissionMode: async (sessionId, mode) => {
      await window.api.acp.setPermissionMode({ sessionId, mode })
      set((s) => ({
        permissionModeBySession: { ...s.permissionModeBySession, [sessionId]: mode }
      }))
    },

    resolvePermission: async (sessionId, requestId, optionId) => {
      await window.api.acp.resolvePermission({ requestId, optionId })
      set((s) => ({
        permissionRequestsBySession: {
          ...s.permissionRequestsBySession,
          [sessionId]: (s.permissionRequestsBySession[sessionId] ?? []).filter(
            (r) => r.requestId !== requestId
          )
        }
      }))
    }
  }
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/acp.test.ts 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/store/slices/acp.ts src/renderer/src/store/slices/acp.test.ts
git commit -m "feat(acp): renderer acp slice (session runtime state + subscriptions)"
```

---

### Task D4: 注册 acp slice 到 store

**Files:**
- Modify: `src/renderer/src/store/index.ts:40-41,83+`
- Modify: `src/renderer/src/store/types.ts`(import 段 + `AppState` 交叉类型)

- [ ] **Step 1: types.ts 加入**

顶部 import 段(与 `TodosSlice` 并列)加:

```ts
import type { AcpSlice } from './slices/acp'
```

`AppState` 交叉类型末尾(`TodosSlice &` 之后)加:

```ts
  AcpSlice
```

> 确认 `TodosSlice` 当前是链尾(以 `& TodosSlice` 结束);若是,改为 `& TodosSlice & AcpSlice`。

- [ ] **Step 2: index.ts 注册**

import 段(与 `createTodosSlice` 并列)加:

```ts
import { createAcpSlice } from './slices/acp'
```

`create<AppState>()` 展开末尾(`...createTodosSlice(...a),` 之后)加:

```ts
  ...createAcpSlice(...a),
```

- [ ] **Step 3: typecheck**

运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:无错误。

- [ ] **Step 4: 提交**

```bash
git add src/renderer/src/store/index.ts src/renderer/src/store/types.ts
git commit -m "feat(acp): register acp slice in app store"
```

---

## Phase E — 渲染层 In Progress 详情 UI

组件目录:`src/renderer/src/components/todo/detail/`。相对 `src/shared` 深度为 5(`../../../../../shared/...`)。
展示型组件(E2/E3/E4)纯 props-in / callback-out,便于 RTL 单测;容器型(E5/E6/E7/E8)读 store 但把可测逻辑抽成纯函数。
RTL 测试统一以 `// @vitest-environment happy-dom` 开头,`import '@testing-library/jest-dom/vitest'`,`afterEach(cleanup)`(vitest 无 globals,自动清理不生效)。

**边界约定(记录在此,避免误解范围):** 进 In Progress 弹窗仅拦截 `TodoStatusMenu`(详情头部)把状态改为 `in_progress` 的路径。看板拖拽入 In Progress 列走 `moveTodoItem` 直改状态,不自动发起会话;用户进详情后用面板的"发起会话"入口手动起会话。此为 P2b 明确范围(spec §5 触发定义)。

### Task E1: todos slice 加内页导航 + updateTodoProject

**Files:**
- Modify: `src/renderer/src/store/slices/todos.ts`
- Test: `src/renderer/src/store/slices/todo-detail-nav.test.ts`

- [ ] **Step 1: 写失败测试**

`src/renderer/src/store/slices/todo-detail-nav.test.ts`:

```ts
// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'

afterEach(() => {
  useAppStore.setState({ todoDetailItemId: null, todoProjects: [] })
  vi.restoreAllMocks()
})

describe('todo detail navigation', () => {
  it('openTodoDetail sets the id, closeTodoDetail clears it', () => {
    useAppStore.getState().openTodoDetail('item-1')
    expect(useAppStore.getState().todoDetailItemId).toBe('item-1')
    useAppStore.getState().closeTodoDetail()
    expect(useAppStore.getState().todoDetailItemId).toBeNull()
  })

  it('updateTodoProject persists and merges the returned project', async () => {
    const updated = {
      id: 'p1',
      name: 'P1',
      identifierPrefix: 'P',
      nextSequence: 1,
      createdAt: '',
      updatedAt: '',
      defaultWorkingDir: '/w'
    }
    ;(window as unknown as { api: unknown }).api = {
      todos: { projects: { update: vi.fn().mockResolvedValue(updated) } }
    }
    useAppStore.setState({ todoProjects: [{ ...updated, defaultWorkingDir: null }] })
    await useAppStore.getState().updateTodoProject({ id: 'p1', defaultWorkingDir: '/w' })
    expect(useAppStore.getState().todoProjects[0]?.defaultWorkingDir).toBe('/w')
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/todo-detail-nav.test.ts 2>&1 | tail -n 30`
预期:FAIL — `openTodoDetail` / `updateTodoProject` 不是函数。

- [ ] **Step 3: 最小实现**

`src/renderer/src/store/slices/todos.ts` — import 段把 project 类型引入补上 `UpdateTodoProjectInput`:

```ts
import type {
  TodoProject,
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  UpdateTodoProjectInput
} from '../../../../shared/todo/todo-project'
```

`TodosSlice` 类型内(`todoLoaded: boolean` 之后)加:

```ts
  todoDetailItemId: string | null
```

`TodosSlice` 动作区(`deleteTodoProject` 之后)加:

```ts
  updateTodoProject: (input: UpdateTodoProjectInput) => Promise<void>
  openTodoDetail: (id: string) => void
  closeTodoDetail: () => void
```

初始 state(`todoLoaded: false,` 之后)加:

```ts
  todoDetailItemId: null,
```

实现(`deleteTodoProject` 实现之后)加:

```ts
  updateTodoProject: async (input) => {
    const updated = await window.api.todos.projects.update(input)
    set((s) => ({
      todoProjects: s.todoProjects.map((project) =>
        project.id === updated.id ? updated : project
      )
    }))
  },

  openTodoDetail: (id) => set({ todoDetailItemId: id }),
  closeTodoDetail: () => set({ todoDetailItemId: null }),
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/todo-detail-nav.test.ts 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/store/slices/todos.ts src/renderer/src/store/slices/todo-detail-nav.test.ts
git commit -m "feat(todo): detail nav + updateTodoProject in todos slice"
```

---

### Task E2: SessionEventItem 单条事件渲染

**Files:**
- Create: `src/renderer/src/components/todo/detail/session-event-item.tsx`
- Test: `src/renderer/src/components/todo/detail/session-event-item.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/detail/session-event-item.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SessionEventItem } from './session-event-item'

afterEach(cleanup)

describe('SessionEventItem', () => {
  it('renders agent message text', () => {
    render(<SessionEventItem event={{ kind: 'agent_message', text: 'hello world' }} />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders a tool call with its title inside a collapsible', () => {
    render(
      <SessionEventItem
        event={{ kind: 'tool_call', toolCallId: 'tc1', title: 'edit file', status: 'completed' }}
      />
    )
    expect(screen.getByText('edit file')).toBeInTheDocument()
  })

  it('renders a thought as collapsible summary', () => {
    render(<SessionEventItem event={{ kind: 'thought', text: 'thinking...' }} />)
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/session-event-item.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/components/todo/detail/session-event-item.tsx`:

```tsx
import React from 'react'
import { cn } from '@/lib/utils'
import type { SessionEvent } from '../../../../../shared/acp/session-event'

type SessionEventItemProps = {
  event: SessionEvent
}

// Why: renderer only consumes the normalized SessionEvent union (Phase D),
// so this component maps each kind to a presentation without ACP specifics.
export function SessionEventItem({ event }: SessionEventItemProps): React.JSX.Element {
  if (event.kind === 'agent_message') {
    return <div className="whitespace-pre-wrap text-sm text-foreground">{event.text}</div>
  }
  if (event.kind === 'user_message') {
    return (
      <div className="whitespace-pre-wrap rounded-md bg-accent px-3 py-2 text-sm text-foreground">
        {event.text}
      </div>
    )
  }
  if (event.kind === 'thought') {
    return (
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">{event.text.slice(0, 60) || 'Thinking'}</summary>
        <div className="mt-1 whitespace-pre-wrap">{event.text}</div>
      </details>
    )
  }
  if (event.kind === 'tool_call') {
    return (
      <details className="rounded-md border border-border px-3 py-2 text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2">
          <span className="font-medium text-foreground">{event.title}</span>
          {event.status ? (
            <span className={cn('text-muted-foreground')}>· {event.status}</span>
          ) : null}
        </summary>
        {event.rawInput !== undefined ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(event.rawInput, null, 2)}
          </pre>
        ) : null}
        {event.content !== undefined ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(event.content, null, 2)}
          </pre>
        ) : null}
      </details>
    )
  }
  // ext: fallthrough badge for cursor-proprietary notifications.
  return (
    <div className="text-xs text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5">{event.method}</span>
    </div>
  )
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/session-event-item.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/session-event-item.tsx src/renderer/src/components/todo/detail/session-event-item.test.tsx
git commit -m "feat(todo): SessionEventItem renders normalized session events"
```

---

### Task E3: PlanChecklist 计划勾选清单

**Files:**
- Create: `src/renderer/src/components/todo/detail/PlanChecklist.tsx`
- Test: `src/renderer/src/components/todo/detail/PlanChecklist.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/detail/PlanChecklist.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PlanChecklist } from './PlanChecklist'

afterEach(cleanup)

describe('PlanChecklist', () => {
  it('renders each plan entry content', () => {
    render(
      <PlanChecklist
        entries={[
          { content: 'step one', status: 'completed' },
          { content: 'step two', status: 'in_progress' },
          { content: 'step three', status: 'pending' }
        ]}
      />
    )
    expect(screen.getByText('step one')).toBeInTheDocument()
    expect(screen.getByText('step two')).toBeInTheDocument()
    expect(screen.getByText('step three')).toBeInTheDocument()
  })

  it('marks the completed entry with a checked state', () => {
    render(<PlanChecklist entries={[{ content: 'done step', status: 'completed' }]} />)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-status', 'completed')
  })

  it('renders an empty hint when there are no entries', () => {
    render(<PlanChecklist entries={[]} />)
    expect(screen.getByText(/no plan/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/PlanChecklist.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/components/todo/detail/PlanChecklist.tsx`:

```tsx
import React from 'react'
import { CheckSquare, Loader2, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { PlanEntry } from '../../../../../shared/acp/session-event'

type PlanChecklistProps = {
  entries: PlanEntry[]
}

function StatusIcon({ status }: { status: PlanEntry['status'] }): React.JSX.Element {
  if (status === 'completed') {
    return <CheckSquare className="size-4 shrink-0 text-green-600" />
  }
  if (status === 'in_progress') {
    return <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />
  }
  return <Square className="size-4 shrink-0 text-muted-foreground" />
}

export function PlanChecklist({ entries }: PlanChecklistProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {translate('auto.components.todo.detail.PlanChecklist.empty', 'No plan yet')}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((entry, i) => (
        <li
          key={`${i}-${entry.content}`}
          data-status={entry.status}
          className={cn(
            'flex items-start gap-2 text-sm',
            entry.status === 'completed' && 'text-muted-foreground line-through'
          )}
        >
          <StatusIcon status={entry.status} />
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{entry.content}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/PlanChecklist.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/PlanChecklist.tsx src/renderer/src/components/todo/detail/PlanChecklist.test.tsx
git commit -m "feat(todo): PlanChecklist renders ACP plan entries"
```

---

### Task E4: PermissionRequestCard 权限卡片(动态 options)

**Files:**
- Create: `src/renderer/src/components/todo/detail/PermissionRequestCard.tsx`
- Test: `src/renderer/src/components/todo/detail/PermissionRequestCard.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/detail/PermissionRequestCard.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PermissionRequestCard, isAlwaysAllowOption } from './PermissionRequestCard'

afterEach(cleanup)

const req = {
  requestId: 'r1',
  sessionId: 's1',
  options: [
    { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' },
    { optionId: 'allow-always', name: 'Always Allow', kind: 'allow_always' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' }
  ],
  toolCall: { toolCallId: 'tc1', title: 'write file', kind: 'edit' }
}

describe('isAlwaysAllowOption', () => {
  it('detects always-allow by kind or optionId', () => {
    expect(isAlwaysAllowOption({ optionId: 'allow-always', name: '', kind: 'allow_always' })).toBe(true)
    expect(isAlwaysAllowOption({ optionId: 'x', name: '', kind: 'allow_once' })).toBe(false)
  })
})

describe('PermissionRequestCard', () => {
  it('renders one button per option from params (no hardcoding)', () => {
    render(<PermissionRequestCard request={req} onResolve={vi.fn()} onSwitchAuto={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Always Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('resolves with the clicked optionId', () => {
    const onResolve = vi.fn()
    render(<PermissionRequestCard request={req} onResolve={onResolve} onSwitchAuto={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(onResolve).toHaveBeenCalledWith('r1', 'allow-once')
  })

  it('switches session to auto when an always-allow option is chosen', () => {
    const onResolve = vi.fn()
    const onSwitchAuto = vi.fn()
    render(<PermissionRequestCard request={req} onResolve={onResolve} onSwitchAuto={onSwitchAuto} />)
    fireEvent.click(screen.getByRole('button', { name: 'Always Allow' }))
    expect(onResolve).toHaveBeenCalledWith('r1', 'allow-always')
    expect(onSwitchAuto).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/PermissionRequestCard.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/components/todo/detail/PermissionRequestCard.tsx`:

```tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import type {
  PermissionRequest,
  PermissionRequestOption
} from '../../../../../shared/acp/session-event'

type PermissionRequestCardProps = {
  request: PermissionRequest
  onResolve: (requestId: string, optionId: string) => void
  onSwitchAuto: () => void
}

// Why: spec §2.3 — "always allow" class options additionally flip the session to
// auto mode. Detect via kind or optionId so engine-specific naming still matches.
export function isAlwaysAllowOption(option: PermissionRequestOption): boolean {
  return option.kind === 'allow_always' || option.optionId.includes('always')
}

export function PermissionRequestCard({
  request,
  onResolve,
  onSwitchAuto
}: PermissionRequestCardProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="text-sm font-medium text-foreground">{request.toolCall.title}</div>
      <div className="flex flex-wrap gap-2">
        {request.options.map((option) => (
          <Button
            key={option.optionId}
            size="sm"
            variant={option.kind === 'reject_once' ? 'outline' : 'default'}
            onClick={() => {
              onResolve(request.requestId, option.optionId)
              if (isAlwaysAllowOption(option)) {
                onSwitchAuto()
              }
            }}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/PermissionRequestCard.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/PermissionRequestCard.tsx src/renderer/src/components/todo/detail/PermissionRequestCard.test.tsx
git commit -m "feat(todo): PermissionRequestCard with dynamic options + auto switch"
```

---

### Task E5: SessionConversation 对话面板(展示型)

**Files:**
- Create: `src/renderer/src/components/todo/detail/SessionConversation.tsx`
- Test: `src/renderer/src/components/todo/detail/SessionConversation.test.tsx`

展示型:所有数据经 props 传入,回调向上。容器(E6)负责接 store。

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/detail/SessionConversation.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SessionConversation } from './SessionConversation'

afterEach(cleanup)

const baseProps = {
  events: [{ kind: 'agent_message' as const, text: 'echo: hi' }],
  permissionRequests: [],
  status: 'complete' as const,
  mode: 'auto' as const,
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onModeChange: vi.fn(),
  onResolvePermission: vi.fn(),
  onSwitchAuto: vi.fn()
}

describe('SessionConversation', () => {
  it('renders events', () => {
    render(<SessionConversation {...baseProps} onSend={vi.fn()} />)
    expect(screen.getByText('echo: hi')).toBeInTheDocument()
  })

  it('sends a follow-up prompt when idle', () => {
    const onSend = vi.fn()
    render(<SessionConversation {...baseProps} onSend={onSend} />)
    const input = screen.getByPlaceholderText(/follow-up/i)
    fireEvent.change(input, { target: { value: 'do more' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('do more')
  })

  it('disables send while running and shows cancel', () => {
    const onCancel = vi.fn()
    render(<SessionConversation {...baseProps} status="running" onSend={vi.fn()} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders permission cards in ask mode', () => {
    render(
      <SessionConversation
        {...baseProps}
        onSend={vi.fn()}
        mode="ask"
        permissionRequests={[
          {
            requestId: 'r1',
            sessionId: 's1',
            options: [{ optionId: 'allow-once', name: 'Allow', kind: 'allow_once' }],
            toolCall: { toolCallId: 'tc1', title: 'write file', kind: 'edit' }
          }
        ]}
      />
    )
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/SessionConversation.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/components/todo/detail/SessionConversation.tsx`:

```tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { PermissionRequest, SessionEvent } from '../../../../../shared/acp/session-event'
import type { AcpSessionStatus } from '../../../store/slices/acp'
import { SessionEventItem } from './session-event-item'
import { PermissionRequestCard } from './PermissionRequestCard'

type PermissionMode = 'auto' | 'ask'

type SessionConversationProps = {
  events: SessionEvent[]
  permissionRequests: PermissionRequest[]
  status: AcpSessionStatus
  mode: PermissionMode
  onSend: (text: string) => void
  onCancel: () => void
  onModeChange: (mode: PermissionMode) => void
  onResolvePermission: (requestId: string, optionId: string) => void
  onSwitchAuto: () => void
}

export function SessionConversation({
  events,
  permissionRequests,
  status,
  mode,
  onSend,
  onCancel,
  onModeChange,
  onResolvePermission,
  onSwitchAuto
}: SessionConversationProps): React.JSX.Element {
  const [draft, setDraft] = React.useState('')
  const running = status === 'running'

  const submit = (): void => {
    const text = draft.trim()
    if (!text || running) {
      return
    }
    onSend(text)
    setDraft('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={mode === 'ask'}
            onChange={(e) => onModeChange(e.target.checked ? 'ask' : 'auto')}
          />
          {translate('auto.components.todo.detail.SessionConversation.askMode', 'Ask before actions')}
        </label>
        <div className="flex-1" />
        {running ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            {translate('auto.components.todo.detail.SessionConversation.cancel', 'Cancel')}
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto scrollbar-sleek pr-1">
        {events.map((event, i) => (
          <SessionEventItem key={i} event={event} />
        ))}
        {mode === 'ask'
          ? permissionRequests.map((request) => (
              <PermissionRequestCard
                key={request.requestId}
                request={request}
                onResolve={onResolvePermission}
                onSwitchAuto={onSwitchAuto}
              />
            ))
          : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <Input
          value={draft}
          disabled={running}
          placeholder={translate(
            'auto.components.todo.detail.SessionConversation.followUp',
            'Send a follow-up prompt…'
          )}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button size="sm" disabled={running || !draft.trim()} onClick={submit}>
          {translate('auto.components.todo.detail.SessionConversation.send', 'Send')}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/SessionConversation.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/SessionConversation.tsx src/renderer/src/components/todo/detail/SessionConversation.test.tsx
git commit -m "feat(todo): SessionConversation panel (events + follow-up + mode + permissions)"
```

---

### Task E6: InProgressPanel 容器(Plan | 进度 | 对话)

**Files:**
- Create: `src/renderer/src/components/todo/detail/InProgressPanel.tsx`
- Test: `src/renderer/src/components/todo/detail/InProgressPanel.test.tsx`

容器读 acp slice。测试用 `vi.mock('@/store')` 注入受控 state。

> **前置(engine/cwd 元数据):** `sendFollowUp(taskId, engine, cwd, text)` 需复用会话原始引擎与 cwd。为此本任务先给 acp slice 加 `activeSessionMetaByTask`(Step 3a),再让容器读它(Step 3b),避免出现占位引擎。两处改动与容器在 Step 5 同一次提交落地。

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/detail/InProgressPanel.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const mockState = {
  activeSessionByTask: {} as Record<string, string | null>,
  eventsBySession: {} as Record<string, unknown[]>,
  planBySession: {} as Record<string, unknown[]>,
  permissionRequestsBySession: {} as Record<string, unknown[]>,
  permissionModeBySession: {} as Record<string, 'auto' | 'ask'>,
  sessionStatusBySession: {} as Record<string, string>,
  loadSessions: vi.fn().mockResolvedValue(undefined),
  sendFollowUp: vi.fn(),
  cancelSession: vi.fn(),
  setPermissionMode: vi.fn(),
  resolvePermission: vi.fn(),
  todoProjects: [] as unknown[]
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { InProgressPanel } = await import('./InProgressPanel')

afterEach(cleanup)

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Do it',
    description: '',
    status: 'in_progress',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 't1',
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    ...overrides
  }
}

describe('InProgressPanel', () => {
  it('loads sessions on mount', () => {
    render(<InProgressPanel item={mkItem()} />)
    expect(mockState.loadSessions).toHaveBeenCalledWith('t1')
  })

  it('shows the launch entry when there is no active session', () => {
    mockState.activeSessionByTask = {}
    render(<InProgressPanel item={mkItem()} />)
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/InProgressPanel.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/components/todo/detail/InProgressPanel.tsx`:

```tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { PlanChecklist } from './PlanChecklist'
import { SessionConversation } from './SessionConversation'
import { EnterInProgressDialog } from './EnterInProgressDialog'

type InProgressPanelProps = {
  item: TodoItem
}

export function InProgressPanel({ item }: InProgressPanelProps): React.JSX.Element {
  const loadSessions = useAppStore((s) => s.loadSessions)
  const sendFollowUp = useAppStore((s) => s.sendFollowUp)
  const cancelSession = useAppStore((s) => s.cancelSession)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const resolvePermission = useAppStore((s) => s.resolvePermission)
  const activeSessionId = useAppStore((s) => s.activeSessionByTask[item.id] ?? null)
  const events = useAppStore((s) => (activeSessionId ? s.eventsBySession[activeSessionId] : undefined))
  const plan = useAppStore((s) => (activeSessionId ? s.planBySession[activeSessionId] : undefined))
  const permissionRequests = useAppStore((s) =>
    activeSessionId ? s.permissionRequestsBySession[activeSessionId] : undefined
  )
  const mode = useAppStore((s) => (activeSessionId ? s.permissionModeBySession[activeSessionId] : undefined))
  const status = useAppStore((s) =>
    activeSessionId ? s.sessionStatusBySession[activeSessionId] : undefined
  )
  const [launchOpen, setLaunchOpen] = React.useState(false)

  React.useEffect(() => {
    void loadSessions(item.id)
  }, [item.id, loadSessions])

  if (!activeSessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">
          {translate('auto.components.todo.detail.InProgressPanel.noSession', 'No active session')}
        </p>
        <Button size="sm" onClick={() => setLaunchOpen(true)}>
          {translate('auto.components.todo.detail.InProgressPanel.start', 'Start session')}
        </Button>
        {launchOpen ? (
          <EnterInProgressDialog item={item} onClose={() => setLaunchOpen(false)} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[16rem_1fr] gap-4">
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-sleek border-r border-border pr-3">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">
          {translate('auto.components.todo.detail.InProgressPanel.plan', 'Plan')}
        </h3>
        <PlanChecklist entries={plan ?? []} />
      </aside>
      <SessionConversation
        events={events ?? []}
        permissionRequests={permissionRequests ?? []}
        status={status ?? 'running'}
        mode={mode ?? 'auto'}
        onSend={(text) => void sendFollowUp(item.id, item.status === 'in_progress' ? 'claude' : 'claude', '', text)}
        onCancel={() => void cancelSession(activeSessionId)}
        onModeChange={(next) => void setPermissionMode(activeSessionId, next)}
        onResolvePermission={(requestId, optionId) =>
          void resolvePermission(activeSessionId, requestId, optionId)
        }
        onSwitchAuto={() => void setPermissionMode(activeSessionId, 'auto')}
      />
    </div>
  )
}
```

> **注意 followUp 的 engine/cwd:** `sendFollowUp(taskId, engine, cwd, text)` 需要引擎与 cwd 复用会话原参数。P2a 的 `AcpSessionRecord` 已存 `engine` / `cwd`;`loadSessions` 目前只回 `{ sessionId }`(见 D3 的 `listSessions` 用法)。**在 Step 3 落地时**:若 `listSessions` 返回体已含 `engine` / `cwd`(P2a `acp:list-sessions` 的实际返回),把它们存入 acp slice 的 `activeSessionMetaByTask: Record<taskId,{engine,cwd}>` 并在此读取;否则最小实现先用占位 `'claude','' `跑通渲染测试,并在本任务 Step 3b 补一条 slice 测试确保元数据回填。占位不得进入最终提交——见下方 Step 3b。

- [ ] **Step 3b: 回填会话元数据(engine/cwd),移除占位**

在 acp slice(`src/renderer/src/store/slices/acp.ts`)加 `activeSessionMetaByTask: Record<string, { engine: AcpEngine; cwd: string }>`;`executeTask` 成功后写入 `{ [taskId]: { engine: input.engine, cwd: input.cwd } }`;`loadSessions` 从 `listSessions` 返回的记录(含 `engine`/`cwd`)回填最近一条。`InProgressPanel` 改用:

```tsx
  const meta = useAppStore((s) => s.activeSessionMetaByTask[item.id])
  // ...
        onSend={(text) => void sendFollowUp(item.id, meta?.engine ?? 'claude', meta?.cwd ?? '', text)}
```

补 acp slice 测试:`executeTask` 后 `activeSessionMetaByTask[taskId]` = `{engine,cwd}`;`loadSessions` 从记录回填。运行:
`npx vitest run --config config/vitest.config.ts src/renderer/src/store/slices/acp.test.ts 2>&1 | tail -n 30`(PASS)。

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/InProgressPanel.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/InProgressPanel.tsx src/renderer/src/components/todo/detail/InProgressPanel.test.tsx src/renderer/src/store/slices/acp.ts src/renderer/src/store/slices/acp.test.ts
git commit -m "feat(todo): InProgressPanel wires plan + conversation to acp slice"
```

---

### Task E7: EnterInProgressDialog 进 In Progress 弹窗

**Files:**
- Create: `src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx`
- Test: `src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`

- [ ] **Step 1: 写失败测试(纯函数优先)**

`src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const mockState = {
  updateTodoItem: vi.fn().mockResolvedValue(undefined),
  executeTask: vi.fn().mockResolvedValue('s1'),
  openTodoDetail: vi.fn(),
  todoProjects: [{ id: 'p1', name: 'P', identifierPrefix: 'P', nextSequence: 1, createdAt: '', updatedAt: '', defaultWorkingDir: '/repo' }]
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { EnterInProgressDialog, buildBasePrompt, composePrompt } = await import('./EnterInProgressDialog')

afterEach(cleanup)

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Ship feature',
    description: 'the body',
    status: 'todo',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 't1',
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    ...overrides
  }
}

describe('prompt builders', () => {
  it('buildBasePrompt joins title and description', () => {
    expect(buildBasePrompt(mkItem())).toBe('Ship feature\n\nthe body')
  })
  it('composePrompt appends extra when present', () => {
    expect(composePrompt('base', '  more  ')).toBe('base\n\nmore')
    expect(composePrompt('base', '   ')).toBe('base')
  })
})

describe('EnterInProgressDialog', () => {
  it('prefills cwd from the project default working dir', () => {
    render(<EnterInProgressDialog item={mkItem()} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/working directory/i)).toHaveValue('/repo')
  })

  it('disables confirm when cwd is empty', () => {
    const projectNoDir = { ...mockState.todoProjects[0], defaultWorkingDir: null }
    mockState.todoProjects = [projectNoDir]
    render(<EnterInProgressDialog item={mkItem()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 最小实现**

`src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx`:

```tsx
import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ACP_ENGINES, type AcpEngine } from '../../../../../shared/acp/acp-session'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

export function buildBasePrompt(item: TodoItem): string {
  return `${item.title}\n\n${item.description}`.trimEnd()
}

export function composePrompt(base: string, extra: string): string {
  const trimmed = extra.trim()
  return trimmed ? `${base}\n\n${trimmed}` : base
}

type EnterInProgressDialogProps = {
  item: TodoItem
  onClose: () => void
}

export function EnterInProgressDialog({
  item,
  onClose
}: EnterInProgressDialogProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const executeTask = useAppStore((s) => s.executeTask)
  const openTodoDetail = useAppStore((s) => s.openTodoDetail)
  const project = useAppStore((s) => s.todoProjects.find((p) => p.id === item.projectId))

  const [engine, setEngine] = React.useState<AcpEngine>(ACP_ENGINES[0])
  const [cwd, setCwd] = React.useState(project?.defaultWorkingDir ?? '')
  const [extra, setExtra] = React.useState('')

  const base = buildBasePrompt(item)

  const confirm = async (): Promise<void> => {
    if (!cwd.trim()) {
      return
    }
    await updateTodoItem(item.id, { status: 'in_progress' })
    await executeTask({ taskId: item.id, engine, prompt: composePrompt(base, extra), cwd: cwd.trim() })
    openTodoDetail(item.id)
    onClose()
  }

  const pickDir = async (): Promise<void> => {
    const picked = await window.api.shell.pickDirectory({ defaultPath: cwd || undefined })
    if (picked) {
      setCwd(picked)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {translate('auto.components.todo.detail.EnterInProgressDialog.title', 'Start session')}
          </h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-engine">
              {translate('auto.components.todo.detail.EnterInProgressDialog.engine', 'Engine')}
            </Label>
            <select
              id="enter-engine"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={engine}
              onChange={(e) => setEngine(e.target.value as AcpEngine)}
            >
              {ACP_ENGINES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-cwd">
              {translate('auto.components.todo.detail.EnterInProgressDialog.cwd', 'Working directory')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="enter-cwd"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/path/to/repo"
              />
              <Button size="sm" variant="outline" onClick={() => void pickDir()}>
                {translate('auto.components.todo.detail.EnterInProgressDialog.browse', 'Browse…')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              {translate('auto.components.todo.detail.EnterInProgressDialog.basePrompt', 'Base prompt')}
            </Label>
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {base}
            </pre>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-extra">
              {translate('auto.components.todo.detail.EnterInProgressDialog.extra', 'Additional prompt')}
            </Label>
            <textarea
              id="enter-extra"
              className="min-h-20 w-full rounded-md border border-input bg-transparent p-2 text-sm"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              {translate('auto.components.todo.detail.EnterInProgressDialog.cancel', 'Cancel')}
            </Button>
            <Button size="sm" disabled={!cwd.trim()} onClick={() => void confirm()}>
              {translate('auto.components.todo.detail.EnterInProgressDialog.start', 'Start')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/EnterInProgressDialog.tsx src/renderer/src/components/todo/detail/EnterInProgressDialog.test.tsx
git commit -m "feat(todo): EnterInProgressDialog (engine/cwd/prompt -> execute)"
```

---

### Task E8: TodoDetailView 全页容器(按 status 分区)

**Files:**
- Create: `src/renderer/src/components/todo/detail/TodoDetailOverview.tsx`
- Create: `src/renderer/src/components/todo/detail/TodoDetailView.tsx`
- Test: `src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`

先抽 overview(迁移 `TodoDetailDialog` 的 Markdown+侧栏)到独立文件避免 view 过大(max-lines)。

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

let items: TodoItem[] = []
const mockState = {
  updateTodoItem: vi.fn().mockResolvedValue(undefined),
  closeTodoDetail: vi.fn(),
  get todoItems() {
    return items
  }
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))
// InProgressPanel pulls the acp slice; stub it to keep this test focused on partitioning.
vi.mock('./InProgressPanel', () => ({
  InProgressPanel: () => <div>in-progress-panel</div>
}))

const { TodoDetailView } = await import('./TodoDetailView')

afterEach(() => {
  cleanup()
  items = []
  vi.clearAllMocks()
})

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Do it',
    description: 'desc',
    status: 'todo',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 't1',
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    ...overrides
  }
}

describe('TodoDetailView', () => {
  it('renders the overview for non-execution statuses', () => {
    items = [mkItem({ status: 'todo' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('Do it')).toBeInTheDocument()
  })

  it('renders the InProgressPanel for in_progress', () => {
    items = [mkItem({ status: 'in_progress' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('in-progress-panel')).toBeInTheDocument()
  })

  it('renders a P3 placeholder for human_review', () => {
    items = [mkItem({ status: 'human_review' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText(/P3/i)).toBeInTheDocument()
  })

  it('closes when the item no longer exists', () => {
    items = []
    render(<TodoDetailView itemId="ghost" />)
    expect(mockState.closeTodoDetail).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/TodoDetailView.test.tsx 2>&1 | tail -n 30`
预期:FAIL — 模块不存在。

- [ ] **Step 3: 实现 overview(迁移自 TodoDetailDialog)**

`src/renderer/src/components/todo/detail/TodoDetailOverview.tsx`:

```tsx
import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { TodoPriority } from '../../../../../shared/todo/todo-priority'
import { TODO_PRIORITY_CATALOG } from '../todo-priority-catalog'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

type TodoDetailOverviewProps = {
  item: TodoItem
}

export function TodoDetailOverview({ item }: TodoDetailOverviewProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-h-32 flex-1 overflow-y-auto scrollbar-sleek">
          <MarkdownPreview
            content={item.description || '_No description_'}
            filePath={`todo/${item.id}.md`}
            scrollCacheKey={`todo-detail:${item.id}`}
          />
        </div>
      </div>
      <aside className="flex w-48 shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="todo-detail-priority">
            {translate('auto.components.todo.TodoDetailDialog.priorityLabel', 'Priority')}
          </Label>
          <select
            id="todo-detail-priority"
            className={cn(SELECT_CLASS)}
            value={item.priority}
            onChange={(e) =>
              void updateTodoItem(item.id, { priority: e.target.value as TodoPriority })
            }
          >
            {TODO_PRIORITY_CATALOG.map((meta) => (
              <option key={meta.id} value={meta.id}>
                {translate(meta.labelKey, meta.fallbackLabel)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="todo-detail-date">
            {translate('auto.components.todo.TodoDetailDialog.scheduledLabel', 'Scheduled')}
          </Label>
          <Input
            id="todo-detail-date"
            type="date"
            value={item.scheduledDate ?? ''}
            onChange={(e) =>
              void updateTodoItem(item.id, { scheduledDate: e.target.value || null })
            }
          />
        </div>
      </aside>
    </div>
  )
}
```

- [ ] **Step 3b: 实现 view(按 status 分区 + 头部状态拦截)**

`src/renderer/src/components/todo/detail/TodoDetailView.tsx`:

```tsx
import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../../shared/todo/todo-status'
import { TodoStatusMenu } from '../TodoStatusMenu'
import { TodoDetailOverview } from './TodoDetailOverview'
import { InProgressPanel } from './InProgressPanel'
import { EnterInProgressDialog } from './EnterInProgressDialog'

type TodoDetailViewProps = {
  itemId: string
}

export function TodoDetailView({ itemId }: TodoDetailViewProps): React.JSX.Element | null {
  const item = useAppStore((s) => s.todoItems.find((i) => i.id === itemId))
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const closeTodoDetail = useAppStore((s) => s.closeTodoDetail)
  const [enterOpen, setEnterOpen] = React.useState(false)

  // Item vanished (deleted / project switch) -> return to the board.
  React.useEffect(() => {
    if (!item) {
      closeTodoDetail()
    }
  }, [item, closeTodoDetail])

  if (!item) {
    return null
  }

  const onStatusChange = (next: TodoStatus): void => {
    // Spec §5: entering in_progress is intercepted to launch the session dialog.
    if (next === 'in_progress' && item.status !== 'in_progress') {
      setEnterOpen(true)
      return
    }
    void updateTodoItem(item.id, { status: next })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Button size="sm" variant="ghost" onClick={() => closeTodoDetail()}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{item.identifier}</span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{item.title}</h2>
        <div className="w-44">
          <TodoStatusMenu value={item.status} onChange={onStatusChange} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {item.status === 'in_progress' ? (
          <InProgressPanel item={item} />
        ) : item.status === 'human_review' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {translate('auto.components.todo.detail.TodoDetailView.humanReviewP3', 'Human Review — coming in P3')}
          </div>
        ) : (
          <TodoDetailOverview item={item} />
        )}
      </div>

      {enterOpen ? (
        <EnterInProgressDialog item={item} onClose={() => setEnterOpen(false)} />
      ) : null}
    </div>
  )
}
```

> `TodoStatusMenu` 是常显 option 列表(非下拉),放头部 `w-44` 容器内即可;若视觉需要收成下拉,P3 再优化,不属本期范围。

- [ ] **Step 4: 运行,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/TodoDetailView.test.tsx 2>&1 | tail -n 30`
预期:PASS。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/detail/TodoDetailOverview.tsx src/renderer/src/components/todo/detail/TodoDetailView.tsx src/renderer/src/components/todo/detail/TodoDetailView.test.tsx
git commit -m "feat(todo): TodoDetailView full-page detail partitioned by status"
```

---

### Task E9: TodoPage 接线(store 导航 + 渲染 TodoDetailView)

**Files:**
- Modify: `src/renderer/src/components/todo/TodoPage.tsx`
- Delete: `src/renderer/src/components/todo/TodoDetailDialog.tsx`(内容已迁入 detail/)
- Delete: `src/renderer/src/components/todo/TodoDetailDialog.test.tsx`(如存在)
- Test: `src/renderer/src/components/todo/todo-page-detail.test.tsx`

- [ ] **Step 1: 写失败测试**

`src/renderer/src/components/todo/todo-page-detail.test.tsx`:

```tsx
// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

let detailId: string | null = null
const mockState = {
  loadTodoProjects: vi.fn().mockResolvedValue(undefined),
  loadTodoTemplates: vi.fn().mockResolvedValue(undefined),
  loadTodoItems: vi.fn().mockResolvedValue(undefined),
  moveTodoItem: vi.fn(),
  openTodoDetail: vi.fn(),
  closeTodoDetail: vi.fn(),
  todoActiveProjectId: 'p1',
  todoItems: [],
  get todoDetailItemId() {
    return detailId
  }
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))
vi.mock('./detail/TodoDetailView', () => ({
  TodoDetailView: ({ itemId }: { itemId: string }) => <div>detail-view:{itemId}</div>
}))

const TodoPage = (await import('./TodoPage')).default

afterEach(() => {
  cleanup()
  detailId = null
  vi.clearAllMocks()
})

describe('TodoPage detail navigation', () => {
  it('shows the board when no detail item is open', () => {
    detailId = null
    render(<TodoPage />)
    expect(screen.queryByText(/detail-view:/)).not.toBeInTheDocument()
  })

  it('shows the full-page detail when todoDetailItemId is set', () => {
    detailId = 't1'
    render(<TodoPage />)
    expect(screen.getByText('detail-view:t1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/todo-page-detail.test.tsx 2>&1 | tail -n 30`
预期:FAIL — `TodoPage` 仍用本地 `detailId`,不读 store。

- [ ] **Step 3: 改 TodoPage 接线**

`src/renderer/src/components/todo/TodoPage.tsx` 全量改为:

```tsx
import React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TodoBoard } from './TodoBoard'
import { TodoCreateDialog } from './TodoCreateDialog'
import { TodoDetailView } from './detail/TodoDetailView'
import { TodoProjectSwitcher } from './TodoProjectSwitcher'

export default function TodoPage(): React.JSX.Element {
  const loadTodoProjects = useAppStore((s) => s.loadTodoProjects)
  const loadTodoTemplates = useAppStore((s) => s.loadTodoTemplates)
  const loadTodoItems = useAppStore((s) => s.loadTodoItems)
  const activeProjectId = useAppStore((s) => s.todoActiveProjectId)
  const items = useAppStore((s) => s.todoItems)
  const moveTodoItem = useAppStore((s) => s.moveTodoItem)
  const detailItemId = useAppStore((s) => s.todoDetailItemId)
  const openTodoDetail = useAppStore((s) => s.openTodoDetail)
  const closeTodoDetail = useAppStore((s) => s.closeTodoDetail)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createStatus, setCreateStatus] = React.useState<TodoStatus | null>(null)

  React.useEffect(() => {
    void loadTodoProjects()
    void loadTodoTemplates()
  }, [loadTodoProjects, loadTodoTemplates])

  React.useEffect(() => {
    // Reset transient state so it can't reference the previous project's item.
    closeTodoDetail()
    setCreateOpen(false)
    setCreateStatus(null)
    if (activeProjectId) {
      void loadTodoItems(activeProjectId)
    }
  }, [activeProjectId, loadTodoItems, closeTodoDetail])

  if (detailItemId) {
    return <TodoDetailView itemId={detailItemId} />
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <TodoProjectSwitcher />
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={!activeProjectId}
          onClick={() => {
            setCreateStatus(null)
            setCreateOpen(true)
          }}
        >
          <Plus className="size-4" />
          {translate('auto.components.todo.TodoPage.newTask', 'New task')}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeProjectId ? (
          <TodoBoard
            items={items}
            onMove={(id, status, orderKey) => void moveTodoItem(id, status, orderKey)}
            onOpenItem={(id) => openTodoDetail(id)}
            onCreate={(status) => {
              setCreateStatus(status)
              setCreateOpen(true)
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {translate('auto.components.todo.TodoPage.empty', 'Create a project to get started')}
          </div>
        )}
      </div>
      {createOpen && activeProjectId ? (
        <TodoCreateDialog
          projectId={activeProjectId}
          initialStatus={createStatus ?? undefined}
          onClose={() => {
            setCreateOpen(false)
            setCreateStatus(null)
          }}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3b: 删除旧 TodoDetailDialog**

```bash
git rm src/renderer/src/components/todo/TodoDetailDialog.tsx
# 若存在其测试:
git rm src/renderer/src/components/todo/TodoDetailDialog.test.tsx 2>/dev/null || true
```

`grep -rn "TodoDetailDialog" src/renderer` 确认无残留引用(除已删文件)。若有,一并清理。

- [ ] **Step 4: 运行 + typecheck**

运行:`npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/todo-page-detail.test.tsx 2>&1 | tail -n 30`
预期:PASS。
运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:无错误。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/src/components/todo/TodoPage.tsx src/renderer/src/components/todo/todo-page-detail.test.tsx
git add -u src/renderer/src/components/todo/
git commit -m "feat(todo): TodoPage renders full-page detail via store nav"
```

---

## 收尾验证(Phase E 之后,全量)

- [ ] **全量单测**

运行:`npx vitest run --config config/vitest.config.ts 2>&1 | tail -n 40`
预期:全绿。

- [ ] **typecheck**

运行:`pnpm typecheck 2>&1 | tail -n 30`
预期:无错误。

- [ ] **lint + max-lines ratchet**

运行:`pnpm lint 2>&1 | tail -n 30 && pnpm check:max-lines-ratchet 2>&1 | tail -n 20`
预期:无新增违规;detail/ 目录已按职责拆分,无文件触顶。

- [ ] **手动冒烟(dev 运行)**

启动 dev,进 TODO 看板 → 打开一张卡进详情全页 → 把状态改 In Progress → 弹窗选引擎(claude/cursor)/确认 cwd/补充提示词 → 确认 → 观察对话流式渲染、Plan 勾选、追加 prompt、ask 模式权限卡片。cursor 引擎需先 `agent login` 或设 `CURSOR_API_KEY`。

