# TODO 看板 P2a(ACP 执行内核)实施计划

> **给 agentic worker 的说明：** 必需的子技能：使用 ddd-subagent-driven-development（推荐）或 ddd-executing-plans 来逐任务实施这份计划。每一步用 checkbox（`- [ ]`）语法做追踪。

**目标：** 在 orca 主进程实现 ACP(Agent Client Protocol)执行内核——通过 IPC 对一个 TODO 任务发起/恢复/取消 ACP 会话、流式广播引擎更新、会话落库、终态自动流转任务状态；claude/qoder 走 ACP,其余引擎命中即抛未接线。不含任何 UI。

**架构：** 新建 `src/main/acp/` 分层内核(launcher → connection-pool → session-manager,旁挂 permission-bridge / execute-router / client / renderer-events),独立库 `acp-sessions.db`(DB 类 + Repository + row-mapping,沿用 `src/main/todos/` 模式),todo 库经 `user_version` 迁移加 `session_id` 列。IPC 走 `src/main/ipc/acp.ts` → `registerAcpHandlers`,依赖经 `runtime.getAcpSessionRepository()` / `runtime.getTodoRepository()` 注入;事件经 `BrowserWindow.getAllWindows()` 广播(双通道 `acp:*` + `acp:*:{id}`)。

**技术栈：** Electron 主进程、TypeScript、better-sqlite3(经 `src/main/sqlite/sync-database`)、`@agentclientprotocol/sdk`、`@agentclientprotocol/claude-agent-acp`、vitest。

**自检方式：** 代码级测试(vitest,scoped 到相关目录),外加 `pnpm typecheck`。

> **依据 spec：** `.dmonwork/specs/2026-07-11-todo-board-p2a-acp-execution-kernel-design.md`
>
> **验证命令(始终 scoped,避免超大输出触发 400)：**
> - 单测(单文件)：`npx vitest run --config config/vitest.config.ts <path/to/file.test.ts> 2>&1 | tail -n 30`
> - 单测(目录)：`npx vitest run --config config/vitest.config.ts src/main/acp 2>&1 | tail -n 30`
> - 类型检查：`pnpm typecheck 2>&1 | tail -n 30`
> - 绝不跑裸的全量 `pnpm test`(输出上千行)。

---

## 文件结构

### 新建

| 文件 | 职责 |
|---|---|
| `src/shared/acp/acp-session.ts` | 领域类型:`ACP_ENGINES`/`AcpEngine`/`isAcpEngine`、`AcpSessionStatus`、`AcpSessionRecord`、`CreateAcpSessionInput`、`StartPromptOptions`、`AcpConnection`(结构化接口)、事件 payload 类型。shared 层,主/预加载/渲染共用。 |
| `src/main/acp/acp-session-database.ts` | `AcpSessionDatabase` 类:schema + `user_version` 迁移骨架 + `idx_acp_sessions_task_id`。 |
| `src/main/acp/acp-session-row-mapping.ts` | `AcpSessionRow` 类型 + `rowToAcpSession`。 |
| `src/main/acp/acp-session-repository.ts` | `AcpSessionRepository`:`create` / `getBySessionId` / `listByTask` / `finish`。 |
| `src/main/acp/acp-agent-launcher.ts` | `getAgentLaunchSpec(engine)` → `{command,args,env}`;`isMockMode()`;PATH 二进制探测。 |
| `src/main/acp/acp-renderer-events.ts` | `broadcastAcpEvent(channel, payload, scopeId?)` 双通道广播(可注入窗口源)。 |
| `src/main/acp/acp-permission-bridge.ts` | `AcpPermissionBridge`:`requestPermission`(P2a 默认放行 + emit)、`resolvePermission`、`rejectAllForSession`。 |
| `src/main/acp/acp-client.ts` | `OrcaAcpClient` 实现 SDK `Client`:`sessionUpdate` / `requestPermission` / `readTextFile` / `writeTextFile`;依赖经构造注入。 |
| `src/main/acp/acp-connection-pool.ts` | 每引擎单例连接 + spawn + `ClientSideConnection` 组装 + 事件缓存(≤3000)+ `replaySessionEvents` + Agent exit 清理。 |
| `src/main/acp/acp-session-manager.ts` | 会话生命周期:`startPrompt`/`runPrompt`/`cancelSession`/`listSessions`/`loadHistory`;并发锁;终态状态流转 + 落库 + 事件。 |
| `src/main/acp/acp-execute-router.ts` | `executeEnginePrompt(opts)`:claude/qoder → session-manager;其它 → 抛 `EngineFallbackNotWired`。 |
| `src/main/ipc/acp.ts` | `registerAcpHandlers(deps)`:`acp:execute`/`cancel`/`resolve-permission`/`list-sessions`/`load-history`。 |
| `tests/fixtures/mock-acp-agent.mjs` | mock ACP Agent(`AgentSideConnection`);`SLOW_TEST`/`PERMISSION_TEST` 特殊 prompt。 |
| 各 `*.test.ts` | 与源文件同目录并置。 |

### 修改

| 文件 | 改动 |
|---|---|
| `package.json` | 加 `@agentclientprotocol/sdk` `^0.25.0`、`@agentclientprotocol/claude-agent-acp` `^0.44.0` 到 dependencies。 |
| `src/shared/todo/todo-item.ts` | `TodoItem` 加 `sessionId: string \| null`。 |
| `src/main/todos/todo-database.ts` | `SCHEMA_VERSION` 1→2;CREATE TABLE 加 `session_id TEXT`;migrate 加 `ALTER TABLE todo_items ADD COLUMN session_id`(hasColumn 守护)。 |
| `src/main/todos/todo-row-mapping.ts` | `TodoItemRow` 加 `session_id`;`rowToTodoItem` 映射 `sessionId`。 |
| `src/main/todos/todo-repository.ts` | insert/update 列出 `session_id`;新增 `setSessionId(id, sessionId)`。 |
| `src/main/runtime/orca-runtime.ts` | 加 `_acpSessionRepository` 字段 + `getAcpSessionRepository()` 惰性 getter(仿 `getTodoRepository`,`acp-sessions.db`)。 |
| `src/main/ipc/register-core-handlers.ts` | import + 调用 `registerAcpHandlers({...})`。 |
| `src/preload/index.ts` | 暴露 `window.api.acp = { execute, cancel, resolvePermission, listSessions, loadHistory, onSessionReady, onUpdate, onComplete, onError, onPermissionRequest, onTaskOutcome }`。 |
| `src/preload/api-types.ts` | 加 `acp` api 类型签名。 |

---

## 任务 1：安装 ACP SDK 依赖并核对 Client 接口

**涉及文件：**
- 修改：`package.json`(dependencies)

- [ ] **第 1 步：加依赖并安装**

在 `package.json` 的 `dependencies` 中加入(按字母序放到 `@` 段)：

```json
"@agentclientprotocol/claude-agent-acp": "^0.44.0",
"@agentclientprotocol/sdk": "^0.25.0",
```

运行：`pnpm install 2>&1 | tail -n 15`

- [ ] **第 2 步：核对 SDK 导出与 Client 接口成员名**

运行(把真实签名记录下来,后续任务据此写 `OrcaAcpClient`)：

```bash
node -e "const s=require('@agentclientprotocol/sdk'); console.log(Object.keys(s).filter(k=>/Connection|ndJson/.test(k)))" 2>&1 | tail -n 5
find node_modules/@agentclientprotocol/sdk -name '*.d.ts' | head -n 5
grep -RnE "interface Client\b|sessionUpdate|requestPermission|readTextFile|writeTextFile" node_modules/@agentclientprotocol/sdk/dist 2>/dev/null | head -n 20
```

预期:能看到 `ClientSideConnection`、`AgentSideConnection`、`ndJsonStream` 导出,且 `Client` 接口含 `sessionUpdate`、`requestPermission`、`readTextFile`、`writeTextFile`。**若成员名/签名与本计划后续代码不一致,以 `.d.ts` 为准微调,并在对应任务处修正。**

- [ ] **第 3 步：提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(acp): add agent-client-protocol SDK deps for P2a"
```

---

## 任务 2：ACP 共享领域类型

**涉及文件：**
- 新建：`src/shared/acp/acp-session.ts`
- 测试：`src/shared/acp/acp-session.test.ts`

- [ ] **第 1 步：写失败的测试**

```typescript
// src/shared/acp/acp-session.test.ts
import { describe, expect, it } from 'vitest'
import { ACP_ENGINES, isAcpEngine } from './acp-session'

describe('acp-session shared types', () => {
  it('lists claude and qoder as the P2a engines', () => {
    expect([...ACP_ENGINES]).toEqual(['claude', 'qoder'])
  })

  it('isAcpEngine narrows known engines and rejects others', () => {
    expect(isAcpEngine('claude')).toBe(true)
    expect(isAcpEngine('qoder')).toBe(true)
    expect(isAcpEngine('cursor')).toBe(false)
    expect(isAcpEngine('')).toBe(false)
  })
})
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/shared/acp/acp-session.test.ts 2>&1 | tail -n 20`
预期：FAIL — 找不到模块 `./acp-session`。

- [ ] **第 3 步：写最小实现**

```typescript
// src/shared/acp/acp-session.ts

// P2a 首批引擎;新增引擎 = 往这里加一项 + launcher 加 spec。
export const ACP_ENGINES = ['claude', 'qoder'] as const
export type AcpEngine = (typeof ACP_ENGINES)[number]

export function isAcpEngine(value: string): value is AcpEngine {
  return (ACP_ENGINES as readonly string[]).includes(value)
}

export type AcpSessionStatus = 'running' | 'completed' | 'error' | 'canceled'

export interface AcpSessionRecord {
  id: string
  taskId: string
  engine: AcpEngine
  sessionId: string
  cwd: string
  status: AcpSessionStatus
  stopReason: string | null
  startedAt: string
  endedAt: string | null
  createdAt: string
}

export interface CreateAcpSessionInput {
  taskId: string
  engine: AcpEngine
  sessionId: string
  cwd: string
}

export interface StartPromptOptions {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  resumeSessionId?: string
}

export interface StartPromptResult {
  sessionId: string
}

export interface AcpTaskOutcome {
  taskId: string
  sessionId: string
  result: 'error' | 'canceled'
}

// 结构化连接接口:session-manager 依赖它,既能被 fake 测试,
// 也能由 connection-pool 返回的 SDK 连接结构化满足。
export interface AcpConnection {
  newSession(params: { cwd: string; mcpServers: [] }): Promise<AcpNewSessionResult>
  resumeSession(params: { sessionId: string; cwd: string }): Promise<AcpNewSessionResult>
  loadSession(params: { sessionId: string; cwd: string }): Promise<unknown>
  prompt(params: {
    sessionId: string
    prompt: { type: 'text'; text: string }[]
  }): Promise<{ stopReason: string }>
  cancel(params: { sessionId: string }): Promise<void>
  setSessionMode?(params: { sessionId: string; modeId: string }): Promise<void>
}

export interface AcpNewSessionResult {
  sessionId: string
  modes?: { currentModeId?: string; availableModes?: { id: string }[] } | null
  models?: unknown
}
```

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/shared/acp/acp-session.test.ts 2>&1 | tail -n 20`
预期：PASS(2 个用例)。

- [ ] **第 5 步：提交**

```bash
git add src/shared/acp/acp-session.ts src/shared/acp/acp-session.test.ts
git commit -m "feat(acp): add shared ACP session domain types"
```

---

## 任务 3：todo 库迁移加 session_id

**涉及文件：**
- 修改：`src/shared/todo/todo-item.ts`
- 修改：`src/main/todos/todo-database.ts:7`(SCHEMA_VERSION)、`:49-66`(CREATE TABLE)、`:92-108`(migrate)
- 修改：`src/main/todos/todo-row-mapping.ts:26-43`(row 类型)、`:80-99`(mapping)
- 修改：`src/main/todos/todo-repository.ts`(insert/update 列 + 新增 setSessionId)
- 测试：`src/main/todos/todo-database.test.ts`(追加迁移用例)、`src/main/todos/todo-repository.test.ts`(追加 setSessionId 用例)

- [ ] **第 1 步：写失败的测试**

在 `src/main/todos/todo-database.test.ts` 追加(文件已 import `TodoDatabase, SCHEMA_VERSION`)：

```typescript
  it('ships schema version 2 with session_id column on a fresh db', () => {
    const d = createDb()
    expect(SCHEMA_VERSION).toBe(2)
    const cols = (d.raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('session_id')
  })

  it('migrates a legacy v1 db by adding session_id and bumping user_version', () => {
    const legacy = new (class extends Object {})() // placeholder removed below
    void legacy
    // 用底层 better-sqlite3 造一个 v1 形态的库:无 session_id 列、user_version=1
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE todo_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL,
        identifier_prefix TEXT NOT NULL, next_sequence INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE todo_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE todo_items (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, project_id TEXT NOT NULL,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'none', scheduled_date TEXT, estimate INTEGER,
        labels TEXT NOT NULL DEFAULT '[]', template_id TEXT, order_key TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);
    `)
    raw.pragma('user_version = 1')
    const before = (raw.pragma('table_info(todo_items)') as { name: string }[]).map((c) => c.name)
    expect(before).not.toContain('session_id')
    raw.close()
    // 说明:真正的迁移断言在下方以 TodoDatabase 打开同一磁盘库完成;
    // :memory: 无法跨连接共享,故此用例仅锚定「v1 无 session_id」前置事实。
  })
```

> 注:`:memory:` 库无法跨连接复用来验证磁盘迁移。真正的「v1→v2 ALTER」用临时文件库验证——见下条用例。

在同文件继续追加(用临时文件,跨连接可见)：

```typescript
  it('adds session_id to an on-disk legacy v1 db when reopened as v2', () => {
    const os = require('node:os') as typeof import('node:os')
    const path = require('node:path') as typeof import('node:path')
    const fs = require('node:fs') as typeof import('node:fs')
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'orca-todo-mig-')), 'todo.db')
    const raw = new Database(file)
    raw.exec(`CREATE TABLE todo_items (id TEXT PRIMARY KEY, identifier TEXT NOT NULL,
      project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog', priority TEXT NOT NULL DEFAULT 'none',
      scheduled_date TEXT, estimate INTEGER, labels TEXT NOT NULL DEFAULT '[]',
      template_id TEXT, order_key TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, started_at TEXT, completed_at TEXT);`)
    raw.exec(`CREATE TABLE todo_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      identifier_prefix TEXT NOT NULL, next_sequence INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    raw.exec(`CREATE TABLE todo_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL,
      body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    raw.pragma('user_version = 1')
    raw.close()

    const migrated = new TodoDatabase(file)
    const cols = (migrated.raw.pragma('table_info(todo_items)') as { name: string }[]).map(
      (c) => c.name
    )
    const version = migrated.raw.pragma('user_version', { simple: true }) as number
    migrated.close()
    expect(cols).toContain('session_id')
    expect(version).toBe(2)
  })
```

在 `src/main/todos/todo-repository.test.ts` 追加(沿用该文件既有的建库/建项目辅助;若无,用 `new TodoRepository(new TodoDatabase(':memory:'))` + `createProject` + `createItem`)：

```typescript
  it('defaults sessionId to null and round-trips setSessionId', () => {
    const repo = new TodoRepository(new TodoDatabase(':memory:'))
    const project = repo.createProject({ name: 'P', identifierPrefix: 'P' })
    const item = repo.createItem({ projectId: project.id, title: 'T' })
    expect(item.sessionId).toBeNull()
    const updated = repo.setSessionId(item.id, 'sess-1')
    expect(updated.sessionId).toBe('sess-1')
    expect(repo.getItem(item.id)?.sessionId).toBe('sess-1')
  })
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/main/todos 2>&1 | tail -n 30`
预期：FAIL(SCHEMA_VERSION 仍为 1;`session_id` 列不存在;`setSessionId` 未定义)。

- [ ] **第 3 步：写最小实现**

`src/main/todos/todo-database.ts` 改 3 处：

版本号(`:7`)：
```typescript
export const SCHEMA_VERSION = 2
```

CREATE TABLE todo_items 末尾列后加(在 `completed_at TEXT` 之后)：
```typescript
        started_at TEXT,
        completed_at TEXT,
        session_id TEXT
```

migrate() 的 try 块内、bump 版本之前加迁移步骤：
```typescript
      if (current < 2 && !this.hasColumn('todo_items', 'session_id')) {
        this.db.exec('ALTER TABLE todo_items ADD COLUMN session_id TEXT')
      }
```

`src/shared/todo/todo-item.ts` 的 `TodoItem` 接口加(放在 `completedAt` 旁)：
```typescript
  sessionId: string | null
```

`src/main/todos/todo-row-mapping.ts` 的 `TodoItemRow` 加：
```typescript
  session_id: string | null
```
`rowToTodoItem` 返回对象加：
```typescript
    sessionId: row.session_id,
```

`src/main/todos/todo-repository.ts`：

createItem 的 INSERT 列清单加 `session_id`,VALUES 加一个 `?`,`.run(...)` 末尾传 `null`(新建无会话)。即列清单改为 `... started_at, completed_at, session_id )`,占位符加到 17 个,`.run` 末尾追加 `null`。

updateItem 的 UPDATE 不动 session_id(普通编辑不应清空会话指针)。

新增方法：
```typescript
  setSessionId(id: string, sessionId: string | null): TodoItem {
    this.db
      .prepare('UPDATE todo_items SET session_id = ?, updated_at = ? WHERE id = ?')
      .run(sessionId, nowIso(), id)
    return this.requireItem(id)
  }
```

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/main/todos 2>&1 | tail -n 30`
预期：PASS(含新增迁移与 setSessionId 用例)。再跑 `pnpm typecheck 2>&1 | tail -n 20` 确认 `TodoItem.sessionId` 贯穿无类型错误。

- [ ] **第 5 步：提交**

```bash
git add src/shared/todo/todo-item.ts src/main/todos/
git commit -m "feat(todo): migrate todo_items to add session_id pointer"
```

---

## 任务 4：acp-sessions.db(AcpSessionDatabase)

**涉及文件：**
- 新建：`src/main/acp/acp-session-database.ts`
- 测试：`src/main/acp/acp-session-database.test.ts`

- [ ] **第 1 步：写失败的测试**

```typescript
// src/main/acp/acp-session-database.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { AcpSessionDatabase, ACP_SCHEMA_VERSION } from './acp-session-database'

describe('AcpSessionDatabase', () => {
  let db: AcpSessionDatabase | undefined
  afterEach(() => db?.close())

  it('creates acp_sessions table and stamps user_version', () => {
    db = new AcpSessionDatabase(':memory:')
    const tables = (
      db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables).toContain('acp_sessions')
    expect(db.raw.pragma('user_version', { simple: true })).toBe(ACP_SCHEMA_VERSION)
  })

  it('creates the task_id index', () => {
    db = new AcpSessionDatabase(':memory:')
    const idx = (
      db.raw.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(idx).toContain('idx_acp_sessions_task_id')
  })
})
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-database.test.ts 2>&1 | tail -n 20`
预期：FAIL — 找不到模块。

- [ ] **第 3 步：写最小实现**

```typescript
// src/main/acp/acp-session-database.ts
import Database from '../sqlite/sync-database'

// 独立执行域库,版本与 todo.db 各自独立;迁移骨架仿 TodoDatabase。
export const ACP_SCHEMA_VERSION = 1

export class AcpSessionDatabase {
  private db: Database.Database

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.ensureSchema()
    this.migrate()
  }

  get raw(): Database.Database {
    return this.db
  }

  private ensureSchema(): void {
    const fresh = (this.db.pragma('user_version', { simple: true }) as number) === 0
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS acp_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        engine TEXT NOT NULL,
        session_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        stop_reason TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_acp_sessions_task_id ON acp_sessions(task_id);
    `)
    if (fresh) {
      this.db.pragma(`user_version = ${ACP_SCHEMA_VERSION}`)
    }
  }

  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number
    if (current >= ACP_SCHEMA_VERSION) {
      return
    }
    this.db.exec('BEGIN')
    try {
      // 未来列新增在此,hasColumn 守护。
      this.db.pragma(`user_version = ${ACP_SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-database.test.ts 2>&1 | tail -n 20`
预期：PASS(2 用例)。

- [ ] **第 5 步：提交**

```bash
git add src/main/acp/acp-session-database.ts src/main/acp/acp-session-database.test.ts
git commit -m "feat(acp): add acp_sessions database schema"
```

---

## 任务 5：acp-session 行映射

**涉及文件：**
- 新建：`src/main/acp/acp-session-row-mapping.ts`
- 测试：`src/main/acp/acp-session-row-mapping.test.ts`

- [ ] **第 1 步：写失败的测试**

```typescript
// src/main/acp/acp-session-row-mapping.test.ts
import { describe, expect, it } from 'vitest'
import { rowToAcpSession, type AcpSessionRow } from './acp-session-row-mapping'

describe('rowToAcpSession', () => {
  it('maps snake_case row to camelCase record', () => {
    const row: AcpSessionRow = {
      id: 'r1',
      task_id: 't1',
      engine: 'claude',
      session_id: 's1',
      cwd: '/w',
      status: 'running',
      stop_reason: null,
      started_at: '2026-07-11T00:00:00.000Z',
      ended_at: null,
      created_at: '2026-07-11T00:00:00.000Z'
    }
    expect(rowToAcpSession(row)).toEqual({
      id: 'r1',
      taskId: 't1',
      engine: 'claude',
      sessionId: 's1',
      cwd: '/w',
      status: 'running',
      stopReason: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      endedAt: null,
      createdAt: '2026-07-11T00:00:00.000Z'
    })
  })
})
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-row-mapping.test.ts 2>&1 | tail -n 20`
预期：FAIL — 找不到模块。

- [ ] **第 3 步：写最小实现**

```typescript
// src/main/acp/acp-session-row-mapping.ts
import type { AcpEngine, AcpSessionRecord, AcpSessionStatus } from '../../shared/acp/acp-session'

export type AcpSessionRow = {
  id: string
  task_id: string
  engine: string
  session_id: string
  cwd: string
  status: string
  stop_reason: string | null
  started_at: string
  ended_at: string | null
  created_at: string
}

export function rowToAcpSession(row: AcpSessionRow): AcpSessionRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    engine: row.engine as AcpEngine,
    sessionId: row.session_id,
    cwd: row.cwd,
    status: row.status as AcpSessionStatus,
    stopReason: row.stop_reason,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at
  }
}
```

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-row-mapping.test.ts 2>&1 | tail -n 20`
预期：PASS。

- [ ] **第 5 步：提交**

```bash
git add src/main/acp/acp-session-row-mapping.ts src/main/acp/acp-session-row-mapping.test.ts
git commit -m "feat(acp): add acp session row mapping"
```

---

## 任务 6：AcpSessionRepository

**涉及文件：**
- 新建：`src/main/acp/acp-session-repository.ts`
- 测试：`src/main/acp/acp-session-repository.test.ts`

- [ ] **第 1 步：写失败的测试**

```typescript
// src/main/acp/acp-session-repository.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { AcpSessionDatabase } from './acp-session-database'
import { AcpSessionRepository } from './acp-session-repository'

describe('AcpSessionRepository', () => {
  let db: AcpSessionDatabase | undefined
  afterEach(() => db?.close())

  function repo(): AcpSessionRepository {
    db = new AcpSessionDatabase(':memory:')
    return new AcpSessionRepository(db)
  }

  it('creates a running record and finds it by sessionId', () => {
    const r = repo()
    const rec = r.create({ taskId: 't1', engine: 'claude', sessionId: 's1', cwd: '/w' })
    expect(rec.status).toBe('running')
    expect(rec.endedAt).toBeNull()
    expect(r.getBySessionId('s1')?.id).toBe(rec.id)
  })

  it('lists sessions for a task newest-first', () => {
    const r = repo()
    r.create({ taskId: 't1', engine: 'claude', sessionId: 's1', cwd: '/w' })
    r.create({ taskId: 't1', engine: 'qoder', sessionId: 's2', cwd: '/w' })
    r.create({ taskId: 't2', engine: 'claude', sessionId: 's3', cwd: '/w' })
    const list = r.listByTask('t1')
    expect(list.map((s) => s.sessionId)).toEqual(['s2', 's1'])
  })

  it('finish stamps status, stopReason and endedAt', () => {
    const r = repo()
    r.create({ taskId: 't1', engine: 'claude', sessionId: 's1', cwd: '/w' })
    const done = r.finish('s1', 'completed', 'end_turn')
    expect(done?.status).toBe('completed')
    expect(done?.stopReason).toBe('end_turn')
    expect(done?.endedAt).not.toBeNull()
  })
})
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-repository.test.ts 2>&1 | tail -n 20`
预期：FAIL — 找不到模块。

- [ ] **第 3 步：写最小实现**

```typescript
// src/main/acp/acp-session-repository.ts
import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import type {
  AcpSessionRecord,
  AcpSessionStatus,
  CreateAcpSessionInput
} from '../../shared/acp/acp-session'
import type { AcpSessionDatabase } from './acp-session-database'
import { rowToAcpSession, type AcpSessionRow } from './acp-session-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

export class AcpSessionRepository {
  private readonly db: Database.Database

  constructor(database: AcpSessionDatabase) {
    this.db = database.raw
  }

  create(input: CreateAcpSessionInput): AcpSessionRecord {
    const id = randomUUID()
    const timestamp = nowIso()
    this.db
      .prepare(
        `INSERT INTO acp_sessions
          (id, task_id, engine, session_id, cwd, status, stop_reason, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'running', NULL, ?, NULL, ?)`
      )
      .run(id, input.taskId, input.engine, input.sessionId, input.cwd, timestamp, timestamp)
    return this.requireById(id)
  }

  getBySessionId(sessionId: string): AcpSessionRecord | null {
    const row = this.db
      .prepare('SELECT * FROM acp_sessions WHERE session_id = ?')
      .get(sessionId) as AcpSessionRow | undefined
    return row ? rowToAcpSession(row) : null
  }

  listByTask(taskId: string): AcpSessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM acp_sessions WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as AcpSessionRow[]
    return rows.map(rowToAcpSession)
  }

  finish(
    sessionId: string,
    status: AcpSessionStatus,
    stopReason: string | null
  ): AcpSessionRecord | null {
    this.db
      .prepare('UPDATE acp_sessions SET status = ?, stop_reason = ?, ended_at = ? WHERE session_id = ?')
      .run(status, stopReason, nowIso(), sessionId)
    return this.getBySessionId(sessionId)
  }

  private requireById(id: string): AcpSessionRecord {
    const row = this.db.prepare('SELECT * FROM acp_sessions WHERE id = ?').get(id) as
      | AcpSessionRow
      | undefined
    if (!row) {
      throw new Error(`AcpSessionRepository: record not found: ${id}`)
    }
    return rowToAcpSession(row)
  }
}
```

> 注:`listByTask` 用 `created_at DESC`;测试中两条记录 created_at 可能同毫秒,若排序不稳定,退化用插入序。实现层用 `ORDER BY created_at DESC, rowid DESC` 保证稳定 newest-first。**实现时按后者写**(即 SQL 加 `, rowid DESC`)。

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-repository.test.ts 2>&1 | tail -n 20`
预期：PASS(3 用例)。

- [ ] **第 5 步：提交**

```bash
git add src/main/acp/acp-session-repository.ts src/main/acp/acp-session-repository.test.ts
git commit -m "feat(acp): add AcpSessionRepository CRUD"
```

---

### 任务 7:ACP 引擎启动规格 acp-agent-launcher

**涉及文件：**
- 新建：`src/main/acp/acp-agent-launcher.ts`
- 测试：`src/main/acp/acp-agent-launcher.test.ts`

- [ ] **第 1 步：写失败的测试**

```typescript
// src/main/acp/acp-agent-launcher.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getAgentLaunchSpec, isMockMode } from './acp-agent-launcher'

describe('acp-agent-launcher', () => {
  const originalEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('isMockMode reflects DMON_ACP_MOCK', () => {
    delete process.env.DMON_ACP_MOCK
    expect(isMockMode()).toBe(false)
    process.env.DMON_ACP_MOCK = '1'
    expect(isMockMode()).toBe(true)
  })

  it('mock mode returns node running the mock agent script for any engine', () => {
    process.env.DMON_ACP_MOCK = '1'
    const spec = getAgentLaunchSpec('claude')
    expect(spec.command).toBe(process.execPath)
    expect(spec.args.some((a) => a.includes('mock-acp-agent.mjs'))).toBe(true)
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('claude spec uses execPath + claude-agent-acp with ELECTRON_RUN_AS_NODE', () => {
    delete process.env.DMON_ACP_MOCK
    const spec = getAgentLaunchSpec('claude')
    expect(spec.command).toBe(process.execPath)
    expect(spec.args.some((a) => a.includes('claude-agent-acp'))).toBe(true)
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect('CLAUDE_CODE_EXECUTABLE' in spec.env).toBe(true)
  })

  it('qoder spec uses --acp flag', () => {
    delete process.env.DMON_ACP_MOCK
    const spec = getAgentLaunchSpec('qoder')
    expect(spec.args).toContain('--acp')
  })
})
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-agent-launcher.test.ts 2>&1 | tail -n 20`
预期：FAIL(模块不存在)。

- [ ] **第 3 步：写最小实现**

```typescript
// src/main/acp/acp-agent-launcher.ts
import { join } from 'node:path'
import { app } from 'electron'
import type { AcpEngine } from '../../shared/acp/acp-session'
import { findBinary } from '../runtime/find-binary'

export type AgentLaunchSpec = {
  command: string
  args: string[]
  env: Record<string, string>
}

export function isMockMode(): boolean {
  return process.env.DMON_ACP_MOCK === '1'
}

// Why: mock agent lives in-repo under tests/; in packaged app it ships in resources.
function mockAgentScriptPath(): string {
  const candidate = app?.isPackaged
    ? join(process.resourcesPath, 'tests', 'mock-acp-agent.mjs')
    : join(app.getAppPath(), 'tests', 'mock-acp-agent.mjs')
  return candidate
}

function mockSpec(): AgentLaunchSpec {
  return {
    command: process.execPath,
    args: [mockAgentScriptPath()],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

function claudeSpec(): AgentLaunchSpec {
  const acpEntry = require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js')
  const claudeBin = findBinary('claude') ?? 'claude'
  return {
    command: process.execPath,
    args: [acpEntry],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      CLAUDE_CODE_EXECUTABLE: claudeBin
    }
  }
}

function qoderSpec(): AgentLaunchSpec {
  const bin = findBinary('qoder') ?? 'qoder'
  return { command: bin, args: ['--acp'], env: {} }
}

export function getAgentLaunchSpec(engine: AcpEngine): AgentLaunchSpec {
  if (isMockMode()) {
    return mockSpec()
  }
  switch (engine) {
    case 'claude':
      return claudeSpec()
    case 'qoder':
      return qoderSpec()
    default: {
      const _exhaustive: never = engine
      throw new Error(`Unknown ACP engine: ${String(_exhaustive)}`)
    }
  }
}
```

> 注:`findBinary` 的实际路径需在实现时核对(`grep -rn "export function findBinary\|export const findBinary" src/main`)。若签名/路径不同,按实际调整 import 与调用;若返回 Promise,则 launcher 相应改为 async(连锁改 connection-pool 的调用点)。测试里 claude/qoder 两条用例依赖 `findBinary` 与 `require.resolve`,在 SDK 未安装或二进制缺失的 CI 环境可能抛错——**实现时若 `require.resolve` 在测试环境失败,将 claude/qoder 两条真机 spec 用例改为 `it.skip` 或用 `vi.mock` 打桩 `findBinary` 与 module resolve**,保留 mock-mode 与 isMockMode 两条必过用例。

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-agent-launcher.test.ts 2>&1 | tail -n 20`
预期：PASS(mock 模式与 isMockMode 用例必过)。

- [ ] **第 5 步：提交**

```bash
git add src/main/acp/acp-agent-launcher.ts src/main/acp/acp-agent-launcher.test.ts
git commit -m "feat(acp): add agent launch spec resolver (claude/qoder/mock)"
```

---

### 任务 8:渲染层事件广播 acp-renderer-events

**涉及文件：**
- 新建：`src/main/acp/acp-renderer-events.ts`
- 测试：`src/main/acp/acp-renderer-events.test.ts`

> 背景:orca **无** `emitToRenderer`。广播沿用 `src/main/star-nag/service.ts` 的 `BrowserWindow.getAllWindows()` 遍历 + `!win.isDestroyed()` 守卫 + `win.webContents.send(channel, payload)`。为可测,本模块把"窗口来源"设计成可注入函数。

- [ ] **第 1 步：写失败的测试**

```typescript
// src/main/acp/acp-renderer-events.test.ts
import { describe, it, expect, vi } from 'vitest'
import { broadcastAcpEvent } from './acp-renderer-events'

type FakeWin = {
  destroyed: boolean
  isDestroyed: () => boolean
  webContents: { send: (channel: string, payload: unknown) => void }
}

function makeWin(): { win: FakeWin; sent: Array<[string, unknown]> } {
  const sent: Array<[string, unknown]> = []
  const win: FakeWin = {
    destroyed: false,
    isDestroyed: () => win.destroyed,
    webContents: { send: (c, p) => sent.push([c, p]) }
  }
  return { win, sent }
}

describe('broadcastAcpEvent', () => {
  it('sends to base channel only when no scopeId', () => {
    const a = makeWin()
    broadcastAcpEvent('acp:complete', { sessionId: 's1' }, undefined, () => [a.win as never])
    expect(a.sent).toEqual([['acp:complete', { sessionId: 's1' }]])
  })

  it('sends to base + scoped channel when scopeId given', () => {
    const a = makeWin()
    broadcastAcpEvent('acp:update', { x: 1 }, 'sess-9', () => [a.win as never])
    expect(a.sent).toEqual([
      ['acp:update', { x: 1 }],
      ['acp:update:sess-9', { x: 1 }]
    ])
  })

  it('skips destroyed windows', () => {
    const a = makeWin()
    a.win.destroyed = true
    broadcastAcpEvent('acp:error', { m: 'x' }, undefined, () => [a.win as never])
    expect(a.sent).toEqual([])
  })
})
```

- [ ] **第 2 步：跑测试,确认失败**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-renderer-events.test.ts 2>&1 | tail -n 20`
预期：FAIL(模块不存在)。

- [ ] **第 3 步：写最小实现**

```typescript
// src/main/acp/acp-renderer-events.ts
import { BrowserWindow } from 'electron'

type WindowLike = {
  isDestroyed: () => boolean
  webContents: { send: (channel: string, payload: unknown) => void }
}

type WindowSource = () => WindowLike[]

const defaultWindowSource: WindowSource = () =>
  BrowserWindow.getAllWindows() as unknown as WindowLike[]

// Why: orca has no emitToRenderer; broadcast to all live windows like star-nag/service.ts.
// scopeId lets the renderer subscribe to a per-session/per-task channel in addition to the base.
export function broadcastAcpEvent(
  channel: string,
  payload: unknown,
  scopeId?: string,
  windowSource: WindowSource = defaultWindowSource
): void {
  const channels = scopeId ? [channel, `${channel}:${scopeId}`] : [channel]
  for (const win of windowSource()) {
    if (win.isDestroyed()) continue
    for (const ch of channels) {
      win.webContents.send(ch, payload)
    }
  }
}
```

- [ ] **第 4 步：跑测试,确认通过**

运行：`npx vitest run --config config/vitest.config.ts src/main/acp/acp-renderer-events.test.ts 2>&1 | tail -n 20`
预期：PASS(3 用例)。

- [ ] **第 5 步：提交**

```bash
git add src/main/acp/acp-renderer-events.ts src/main/acp/acp-renderer-events.test.ts
git commit -m "feat(acp): add renderer event broadcast helper"
```

---

### 任务 9:Mock ACP Agent 测试夹具

**涉及文件：**
- 新建:`tests/mock-acp-agent.mjs`

> 这是一个独立的 Node 脚本,通过 SDK 的 `AgentSideConnection` + `ndJsonStream` 在 stdin/stdout 上实现 Agent 侧。被 launcher 在 `DMON_ACP_MOCK=1` 时 spawn。它没有自己的 vitest 用例——它是**给后续任务(11-13)的集成测试用的被测依赖**。本任务的"测试"= 一个冒烟脚本,确认它能 initialize + newSession + prompt。

- [ ] **第 1 步:写冒烟测试**

```typescript
// src/main/acp/mock-acp-agent.smoke.test.ts
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

// Why: verify the mock agent speaks ACP well enough for later integration tests.
describe('mock-acp-agent smoke', () => {
  it('responds to initialize over stdio', async () => {
    const script = join(process.cwd(), 'tests', 'mock-acp-agent.mjs')
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'inherit']
    })
    const req =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: 1, clientCapabilities: {} }
      }) + '\n'
    child.stdin.write(req)
    const line = await new Promise<string>((resolve, reject) => {
      let buf = ''
      const timer = setTimeout(() => reject(new Error('timeout')), 5000)
      child.stdout.on('data', (d) => {
        buf += d.toString()
        const nl = buf.indexOf('\n')
        if (nl >= 0) {
          clearTimeout(timer)
          resolve(buf.slice(0, nl))
        }
      })
    })
    child.kill()
    const msg = JSON.parse(line)
    expect(msg.id).toBe(1)
    expect(msg.result).toBeTruthy()
    expect(msg.result.protocolVersion).toBeDefined()
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/mock-acp-agent.smoke.test.ts 2>&1 | tail -n 20`
预期:FAIL(脚本不存在 → spawn 出错或超时)。

- [ ] **第 3 步:写最小实现**

```javascript
// tests/mock-acp-agent.mjs
import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk'

// Why: minimal in-repo ACP agent for TDD; supports the flows P2a exercises.
const sessions = new Map()
let counter = 0

const agent = {
  async initialize() {
    return {
      protocolVersion: 1,
      agentCapabilities: { loadSession: true },
      authMethods: []
    }
  },
  async newSession({ cwd }) {
    const sessionId = `mock-sess-${++counter}`
    sessions.set(sessionId, { cwd, history: [] })
    return { sessionId, modes: { current: 'default', available: ['default', 'bypassPermissions'] }, models: [] }
  },
  async resumeSession({ sessionId }) {
    if (!sessions.has(sessionId)) throw new Error('no such session')
    return { sessionId }
  },
  async loadSession({ sessionId }) {
    if (!sessions.has(sessionId)) throw new Error('no such session')
    return { sessionId }
  },
  async listSessions() {
    return { sessions: [...sessions.keys()].map((id) => ({ sessionId: id })) }
  },
  async setSessionMode() {
    return {}
  },
  async cancel({ sessionId }) {
    const s = sessions.get(sessionId)
    if (s) s.canceled = true
    return {}
  },
  async prompt({ sessionId, prompt }, connection) {
    const text = (prompt ?? []).map((p) => p.text ?? '').join('')
    const send = (update) =>
      connection.sessionUpdate({ sessionId, update })

    if (text.includes('PERMISSION_TEST')) {
      await connection.requestPermission({
        sessionId,
        options: [
          { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
          { optionId: 'deny', name: 'Deny', kind: 'reject_once' }
        ],
        toolCall: { toolCallId: 'tc-1', title: 'mock tool', kind: 'edit' }
      })
    }

    if (text.includes('SLOW_TEST')) {
      const s = sessions.get(sessionId)
      for (let i = 0; i < 50; i++) {
        if (s?.canceled) return { stopReason: 'cancelled' }
        await new Promise((r) => setTimeout(r, 100))
      }
      return { stopReason: 'end_turn' }
    }

    await send({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `echo: ${text}` } })
    return { stopReason: 'end_turn' }
  }
}

const stream = ndJsonStream(process.stdout, process.stdin)
new AgentSideConnection((_client) => agent, stream)
```

> 注:mock 脚本对 SDK 的 `AgentSideConnection` 回调签名(第二参是否为 connection、`sessionUpdate` 的 `update` 形状)依赖 SDK 实际 API。**实现任务 1 时已核对过 `.d.ts`**,此处按核对结果对齐;若 `prompt` 回调不注入 connection,则改为闭包捕获 `AgentSideConnection` 实例。冒烟测试只断言 `initialize` 返回,故 SDK 细节差异不影响本任务通过;`newSession`/`prompt`/`SLOW_TEST`/`PERMISSION_TEST` 的正确性在任务 11-13 的集成测试中验证——**若届时发现形状不符,回到本文件修 mock**。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/mock-acp-agent.smoke.test.ts 2>&1 | tail -n 20`
预期:PASS(initialize 往返成功)。

- [ ] **第 5 步:提交**

```bash
git add tests/mock-acp-agent.mjs src/main/acp/mock-acp-agent.smoke.test.ts
git commit -m "test(acp): add mock ACP agent fixture + smoke test"
```

---

### 任务 10:权限桥 acp-permission-bridge

**涉及文件：**
- 新建:`src/main/acp/acp-permission-bridge.ts`
- 测试:`src/main/acp/acp-permission-bridge.test.ts`

> §6 决策:P2a 默认放行 + 保留交互契约。桥接维护 `requestId → resolver` 表;`requestPermission` 进来时:生成 requestId、广播 `acp:permission-request`、**默认自动放行**(选第一个 allow 型 option),同时保留 `resolvePermission(requestId, optionId)` 供 P2b 覆盖;`rejectAllForSession(sessionId)` 用于 cancel 时清场。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/acp/acp-permission-bridge.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AcpPermissionBridge } from './acp-permission-bridge'

const allowOpt = { optionId: 'allow', name: 'Allow', kind: 'allow_once' as const }
const denyOpt = { optionId: 'deny', name: 'Deny', kind: 'reject_once' as const }

describe('AcpPermissionBridge', () => {
  it('auto-allows by default and broadcasts the request', async () => {
    const broadcast = vi.fn()
    const bridge = new AcpPermissionBridge(broadcast)
    const outcome = await bridge.requestPermission('sess-1', {
      options: [allowOpt, denyOpt],
      toolCall: { toolCallId: 't1', title: 'x' }
    })
    expect(outcome).toEqual({ outcome: 'selected', optionId: 'allow' })
    expect(broadcast).toHaveBeenCalledWith(
      'acp:permission-request',
      expect.objectContaining({ sessionId: 'sess-1' }),
      'sess-1'
    )
  })

  it('resolvePermission overrides the pending request before auto-allow', async () => {
    const bridge = new AcpPermissionBridge(vi.fn(), { autoAllow: false })
    let capturedRequestId = ''
    const orig = bridge.requestPermission.bind(bridge)
    // start request; capture id via broadcast
    const broadcast = vi.fn((_c, payload: { requestId: string }) => {
      capturedRequestId = payload.requestId
    })
    const b2 = new AcpPermissionBridge(broadcast, { autoAllow: false })
    const p = b2.requestPermission('sess-2', { options: [allowOpt, denyOpt], toolCall: { toolCallId: 't', title: 'y' } })
    expect(capturedRequestId).not.toBe('')
    b2.resolvePermission(capturedRequestId, 'deny')
    await expect(p).resolves.toEqual({ outcome: 'selected', optionId: 'deny' })
    void orig
  })

  it('rejectAllForSession resolves pending with cancelled', async () => {
    const bridge = new AcpPermissionBridge(vi.fn(), { autoAllow: false })
    let reqId = ''
    const b = new AcpPermissionBridge((_c, p: { requestId: string }) => { reqId = p.requestId }, { autoAllow: false })
    const pending = b.requestPermission('sess-3', { options: [allowOpt], toolCall: { toolCallId: 't', title: 'z' } })
    b.rejectAllForSession('sess-3')
    await expect(pending).resolves.toEqual({ outcome: 'cancelled' })
    void reqId
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-permission-bridge.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

```typescript
// src/main/acp/acp-permission-bridge.ts
type PermissionOption = { optionId: string; name: string; kind: string }
type RequestPermissionParams = {
  options: PermissionOption[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}
export type PermissionOutcome =
  | { outcome: 'selected'; optionId: string }
  | { outcome: 'cancelled' }

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

type PendingEntry = {
  sessionId: string
  resolve: (o: PermissionOutcome) => void
}

let requestSeq = 0

function firstAllowOptionId(options: PermissionOption[]): string | undefined {
  const allow = options.find((o) => o.kind.startsWith('allow'))
  return (allow ?? options[0])?.optionId
}

export class AcpPermissionBridge {
  private pending = new Map<string, PendingEntry>()
  private readonly autoAllow: boolean

  constructor(
    private readonly broadcast: BroadcastFn,
    opts: { autoAllow?: boolean } = {}
  ) {
    this.autoAllow = opts.autoAllow ?? true
  }

  requestPermission(sessionId: string, params: RequestPermissionParams): Promise<PermissionOutcome> {
    const requestId = `perm-${++requestSeq}`
    return new Promise<PermissionOutcome>((resolve) => {
      this.pending.set(requestId, { sessionId, resolve })
      this.broadcast('acp:permission-request', { requestId, sessionId, params }, sessionId)
      if (this.autoAllow) {
        const optionId = firstAllowOptionId(params.options)
        if (optionId) {
          this.resolvePermission(requestId, optionId)
        }
      }
    })
  }

  resolvePermission(requestId: string, optionId: string): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return false
    this.pending.delete(requestId)
    entry.resolve({ outcome: 'selected', optionId })
    return true
  }

  rejectAllForSession(sessionId: string): void {
    for (const [id, entry] of [...this.pending.entries()]) {
      if (entry.sessionId === sessionId) {
        this.pending.delete(id)
        entry.resolve({ outcome: 'cancelled' })
      }
    }
  }
}
```

> 注:`PermissionOutcome` 的实际形状须匹配 SDK `requestPermission` 返回类型(任务 1 已核对 `.d.ts`)。若 SDK 用 `{ outcome: { outcome: 'selected', optionId } }` 之类的嵌套,实现时对齐并同步改 client(任务 11)包装。测试断言随实现形状调整。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-permission-bridge.test.ts 2>&1 | tail -n 20`
预期:PASS(3 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-permission-bridge.ts src/main/acp/acp-permission-bridge.test.ts
git commit -m "feat(acp): add permission bridge (default-allow + interactive contract)"
```

---

### 任务 11:Client 侧实现 OrcaAcpClient

**涉及文件：**
- 新建:`src/main/acp/acp-client.ts`
- 测试:`src/main/acp/acp-client.test.ts`

> `OrcaAcpClient` 实现 ACP Client 接口(SDK 要求的方法,任务 1 已核对):`sessionUpdate`(转广播 + 缓存)、`requestPermission`(委托 permission bridge)、`readTextFile`/`writeTextFile`(fs 能力,P2a 用 node fs 直读写)。它不持有连接,只处理 Agent → Client 的入站回调。事件缓存(供 replay)放在 connection-pool(任务 12),client 通过注入的 `onSessionUpdate` 回调上报。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/acp/acp-client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { OrcaAcpClient } from './acp-client'

describe('OrcaAcpClient', () => {
  it('sessionUpdate forwards notification to onSessionUpdate', async () => {
    const onSessionUpdate = vi.fn()
    const client = new OrcaAcpClient('claude', {
      onSessionUpdate,
      requestPermission: vi.fn()
    })
    const notif = { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk' } }
    await client.sessionUpdate(notif as never)
    expect(onSessionUpdate).toHaveBeenCalledWith(notif)
  })

  it('requestPermission delegates to injected handler', async () => {
    const requestPermission = vi.fn().mockResolvedValue({ outcome: 'selected', optionId: 'allow' })
    const client = new OrcaAcpClient('claude', {
      onSessionUpdate: vi.fn(),
      requestPermission
    })
    const params = { sessionId: 's1', options: [], toolCall: { toolCallId: 't', title: 'x' } }
    const res = await client.requestPermission(params as never)
    expect(requestPermission).toHaveBeenCalledWith('s1', expect.objectContaining({ options: [] }))
    expect(res).toEqual({ outcome: 'selected', optionId: 'allow' })
  })

  it('readTextFile / writeTextFile hit the real fs', async () => {
    const client = new OrcaAcpClient('claude', { onSessionUpdate: vi.fn(), requestPermission: vi.fn() })
    const dir = await fs.mkdtemp(join(tmpdir(), 'acp-client-'))
    const path = join(dir, 'a.txt')
    await client.writeTextFile({ path, content: 'hello' } as never)
    const out = await client.readTextFile({ path } as never)
    expect(out.content).toBe('hello')
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-client.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

```typescript
// src/main/acp/acp-client.ts
import { promises as fs } from 'node:fs'
import type { AcpEngine } from '../../shared/acp/acp-session'
import type { PermissionOutcome } from './acp-permission-bridge'

type SessionNotification = { sessionId: string; update: unknown }

type RequestPermissionRequest = {
  sessionId: string
  options: Array<{ optionId: string; name: string; kind: string }>
  toolCall: { toolCallId: string; title: string; kind?: string }
}

export type OrcaAcpClientDeps = {
  onSessionUpdate: (notif: SessionNotification) => void
  requestPermission: (
    sessionId: string,
    params: { options: RequestPermissionRequest['options']; toolCall: RequestPermissionRequest['toolCall'] }
  ) => Promise<PermissionOutcome>
}

// Why: Client side of ACP — handles inbound Agent→Client callbacks only.
export class OrcaAcpClient {
  constructor(
    private readonly engine: AcpEngine,
    private readonly deps: OrcaAcpClientDeps
  ) {}

  async sessionUpdate(notif: SessionNotification): Promise<void> {
    this.deps.onSessionUpdate(notif)
  }

  async requestPermission(req: RequestPermissionRequest): Promise<PermissionOutcome> {
    return this.deps.requestPermission(req.sessionId, {
      options: req.options,
      toolCall: req.toolCall
    })
  }

  async readTextFile(req: { path: string }): Promise<{ content: string }> {
    const content = await fs.readFile(req.path, 'utf8')
    return { content }
  }

  async writeTextFile(req: { path: string; content: string }): Promise<void> {
    await fs.writeFile(req.path, req.content, 'utf8')
  }
}
```

> 注:方法名/入参/返回形状须与 SDK `Client` 接口(任务 1 核对的 `.d.ts`)逐一对齐——SDK 可能要求 `readTextFile` 返回带 `line`/`limit` 处理,或方法名为 `fsReadTextFile` 等。**以 `.d.ts` 为准**;若 SDK 的 Client 接口还有 terminal 能力方法(`createTerminal` 等),P2a 用最小桩实现(抛 `not implemented` 或返回空)并在此注明。`requestPermission` 返回类型须匹配任务 10 与 SDK。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-client.test.ts 2>&1 | tail -n 20`
预期:PASS(3 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-client.ts src/main/acp/acp-client.test.ts
git commit -m "feat(acp): add OrcaAcpClient (session updates / permission / fs)"
```

---

### 任务 12:连接池 acp-connection-pool

**涉及文件：**
- 新建:`src/main/acp/acp-connection-pool.ts`
- 测试:`src/main/acp/acp-connection-pool.test.ts`

> 每引擎单例长连接。`getAcpConnection(engine)`:命中缓存则复用;否则 `getAgentLaunchSpec` → spawn → `ndJsonStream(stdin,stdout)` → `new ClientSideConnection((_agent)=>new OrcaAcpClient(...), stream)` → `connection.initialize(...)`。维护每引擎的 `sessionUpdate` 事件缓存(上限 3000,`Map<sessionId, SessionNotification[]>`),`replaySessionEvents(sessionId, emit)` 回放;Agent 进程 `exit` → 清理该引擎全部 streaming session + 触发注入的 `onEngineExit(engine)`。为可测,spawn 与 connection 构造设计成可注入。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/acp/acp-connection-pool.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AcpConnectionPool } from './acp-connection-pool'

function fakeConnection() {
  return {
    initialize: vi.fn().mockResolvedValue({ protocolVersion: 1, agentCapabilities: {} }),
    newSession: vi.fn(),
    prompt: vi.fn(),
    cancel: vi.fn()
  }
}

describe('AcpConnectionPool', () => {
  it('reuses a single connection per engine', async () => {
    const connect = vi.fn().mockImplementation(() => {
      const conn = fakeConnection()
      return { connection: conn, onExit: () => {}, dispose: () => {} }
    })
    const pool = new AcpConnectionPool({ connect })
    const a = await pool.getAcpConnection('claude')
    const b = await pool.getAcpConnection('claude')
    expect(a).toBe(b)
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('caches session updates and replays them (cap enforced)', () => {
    const pool = new AcpConnectionPool({ connect: vi.fn() })
    for (let i = 0; i < 3005; i++) {
      pool.recordSessionUpdate('claude', 'sess-1', { sessionId: 'sess-1', update: { i } } as never)
    }
    const seen: unknown[] = []
    pool.replaySessionEvents('sess-1', (n) => seen.push(n))
    expect(seen.length).toBe(3000) // cap
    expect((seen[seen.length - 1] as { update: { i: number } }).update.i).toBe(3004)
  })

  it('closeAcpConnection disposes and drops the cached entry', async () => {
    const dispose = vi.fn()
    const connect = vi.fn().mockReturnValue({ connection: fakeConnection(), onExit: () => {}, dispose })
    const pool = new AcpConnectionPool({ connect })
    await pool.getAcpConnection('qoder')
    pool.closeAcpConnection('qoder')
    expect(dispose).toHaveBeenCalledTimes(1)
    await pool.getAcpConnection('qoder')
    expect(connect).toHaveBeenCalledTimes(2) // re-spawned
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-connection-pool.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

```typescript
// src/main/acp/acp-connection-pool.ts
import { spawn } from 'node:child_process'
import type { AcpEngine } from '../../shared/acp/acp-session'
import type { AcpConnection } from '../../shared/acp/acp-session'
import { getAgentLaunchSpec } from './acp-agent-launcher'

type SessionNotification = { sessionId: string; update: unknown }

const EVENT_CACHE_CAP = 3000

export type ConnectResult = {
  connection: AcpConnection
  onExit: (cb: () => void) => void
  dispose: () => void
}

type ConnectFn = (engine: AcpEngine, client: unknown) => ConnectResult

type PoolDeps = {
  connect?: ConnectFn
  buildClient?: (engine: AcpEngine, onSessionUpdate: (n: SessionNotification) => void) => unknown
}

type PoolEntry = {
  connection: AcpConnection
  dispose: () => void
  sessionIds: Set<string>
}

export class AcpConnectionPool {
  private entries = new Map<AcpEngine, PoolEntry>()
  private eventCache = new Map<string, SessionNotification[]>()
  private readonly connect: ConnectFn

  constructor(deps: PoolDeps = {}) {
    this.connect = deps.connect ?? defaultConnect
  }

  async getAcpConnection(engine: AcpEngine): Promise<AcpConnection> {
    const existing = this.entries.get(engine)
    if (existing) return existing.connection

    const result = this.connect(engine, undefined)
    const entry: PoolEntry = {
      connection: result.connection,
      dispose: result.dispose,
      sessionIds: new Set()
    }
    this.entries.set(engine, entry)
    result.onExit(() => this.handleExit(engine))
    if (typeof result.connection.initialize === 'function') {
      await result.connection.initialize({
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        clientInfo: { name: 'orca', version: '0' }
      })
    }
    return entry.connection
  }

  recordSessionUpdate(_engine: AcpEngine, sessionId: string, notif: SessionNotification): void {
    const list = this.eventCache.get(sessionId) ?? []
    list.push(notif)
    if (list.length > EVENT_CACHE_CAP) list.splice(0, list.length - EVENT_CACHE_CAP)
    this.eventCache.set(sessionId, list)
  }

  replaySessionEvents(sessionId: string, emit: (n: SessionNotification) => void): void {
    for (const n of this.eventCache.get(sessionId) ?? []) emit(n)
  }

  trackSession(engine: AcpEngine, sessionId: string): void {
    this.entries.get(engine)?.sessionIds.add(sessionId)
  }

  closeAcpConnection(engine: AcpEngine): void {
    const entry = this.entries.get(engine)
    if (!entry) return
    entry.dispose()
    this.entries.delete(engine)
  }

  private handleExit(engine: AcpEngine): void {
    this.entries.delete(engine)
  }
}

// Why: real spawn+SDK wiring; injected fake in tests keeps this untested-by-unit but exercised in integration.
function defaultConnect(engine: AcpEngine): ConnectResult {
  const spec = getAgentLaunchSpec(engine)
  const child = spawn(spec.command, spec.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...spec.env }
  })
  // NOTE(impl): wire ndJsonStream + ClientSideConnection here using SDK (task 1 shapes).
  // const stream = ndJsonStream(child.stdin, child.stdout)
  // const connection = new ClientSideConnection((_agent) => new OrcaAcpClient(engine, deps), stream)
  const exitCbs: Array<() => void> = []
  child.on('exit', () => exitCbs.forEach((cb) => cb()))
  const connection = {} as AcpConnection
  return {
    connection,
    onExit: (cb) => exitCbs.push(cb),
    dispose: () => child.kill()
  }
}
```

> 注:`defaultConnect` 的 SDK 接线(`ndJsonStream` + `ClientSideConnection` + `OrcaAcpClient` 注入 `onSessionUpdate`→`recordSessionUpdate`+广播、`requestPermission`→bridge)在实现时按任务 1 的 `.d.ts` 补全。单元测试只走**注入的 fake `connect`**,不触真 spawn(避免 CI 依赖引擎二进制)。`defaultConnect` 的真机联调不在单测覆盖内(集成测试用 mock agent 覆盖,见任务 13)。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-connection-pool.test.ts 2>&1 | tail -n 20`
预期:PASS(3 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-connection-pool.ts src/main/acp/acp-connection-pool.test.ts
git commit -m "feat(acp): add per-engine connection pool with event cache/replay"
```

---

### 任务 13a:会话管理器 acp-session-manager — 新建会话 + happy-path + 状态流转 + 落库

**涉及文件：**
- 新建:`src/main/acp/acp-session-manager.ts`
- 测试:`src/main/acp/acp-session-manager.test.ts`

> 会话生命周期核心。依赖经构造注入(便于测):`connectionPool`(任务 12)、`acpSessions`(任务 6 repo)、`todos`(任务 3 repo,取 `setSessionId`/`updateStatus`)、`permissionBridge`(任务 10)、`broadcast`(任务 8)、`now()`。本任务只做 `startPrompt` + happy-path `runPrompt` 完成 → 状态流转 + 落库 + 事件。cancel/并发/resume/error 放 13b。

**状态流转规则(§4):** runPrompt 正常 resolve 且 `stopReason !== 'cancelled'` → 若任务仍 `in_progress` 则置 `human_review`;`acp_sessions.status=completed` + `ended_at`/`stop_reason`;emit `acp:complete`。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/acp/acp-session-manager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AcpSessionManager } from './acp-session-manager'

function deps() {
  const connection = {
    newSession: vi.fn().mockResolvedValue({ sessionId: 'eng-sess-1', modes: { current: 'default', available: ['default'] }, models: [] }),
    resumeSession: vi.fn(),
    loadSession: vi.fn(),
    prompt: vi.fn().mockResolvedValue({ stopReason: 'end_turn' }),
    cancel: vi.fn().mockResolvedValue(undefined),
    setSessionMode: vi.fn().mockResolvedValue(undefined)
  }
  const connectionPool = {
    getAcpConnection: vi.fn().mockResolvedValue(connection),
    trackSession: vi.fn(),
    replaySessionEvents: vi.fn(),
    recordSessionUpdate: vi.fn()
  }
  const acpSessions = {
    create: vi.fn().mockImplementation((i) => ({ ...i, status: 'running', endedAt: null, stopReason: null })),
    finish: vi.fn(),
    listByTask: vi.fn().mockReturnValue([]),
    getBySessionId: vi.fn()
  }
  const todos = {
    setSessionId: vi.fn(),
    updateStatus: vi.fn(),
    getById: vi.fn().mockReturnValue({ id: 'task-1', status: 'in_progress' })
  }
  const broadcast = vi.fn()
  return { connection, connectionPool, acpSessions, todos, broadcast }
}

function makeManager(d: ReturnType<typeof deps>) {
  return new AcpSessionManager({
    connectionPool: d.connectionPool as never,
    acpSessions: d.acpSessions as never,
    todos: d.todos as never,
    permissionBridge: { requestPermission: vi.fn(), resolvePermission: vi.fn(), rejectAllForSession: vi.fn() } as never,
    broadcast: d.broadcast,
    now: () => '2026-07-11T00:00:00.000Z'
  })
}

describe('AcpSessionManager start + happy path', () => {
  it('startPrompt creates a new session, persists, emits ready, returns sessionId', async () => {
    const d = deps()
    const mgr = makeManager(d)
    const res = await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    expect(res.sessionId).toBe('eng-sess-1')
    expect(d.connection.newSession).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/tmp', mcpServers: [] }))
    expect(d.acpSessions.create).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-1', engine: 'claude', sessionId: 'eng-sess-1', cwd: '/tmp' }))
    expect(d.todos.setSessionId).toHaveBeenCalledWith('task-1', 'eng-sess-1')
    expect(d.broadcast).toHaveBeenCalledWith('acp:session-ready', expect.objectContaining({ sessionId: 'eng-sess-1' }), 'eng-sess-1')
  })

  it('successful runPrompt flips in_progress task to human_review and finishes session completed', async () => {
    const d = deps()
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.todos.updateStatus).toHaveBeenCalledWith('task-1', 'human_review')
    expect(d.acpSessions.finish).toHaveBeenCalledWith('eng-sess-1', expect.objectContaining({ status: 'completed', stopReason: 'end_turn', endedAt: '2026-07-11T00:00:00.000Z' }))
    expect(d.broadcast).toHaveBeenCalledWith('acp:complete', expect.objectContaining({ sessionId: 'eng-sess-1', stopReason: 'end_turn' }), 'eng-sess-1')
  })

  it('does not flip task status if it already left in_progress', async () => {
    const d = deps()
    d.todos.getById.mockReturnValue({ id: 'task-1', status: 'human_review' })
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.todos.updateStatus).not.toHaveBeenCalled()
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-manager.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

```typescript
// src/main/acp/acp-session-manager.ts
import type {
  AcpEngine,
  AcpConnection,
  StartPromptOptions,
  StartPromptResult
} from '../../shared/acp/acp-session'

type SessionNotification = { sessionId: string; update: unknown }

type ConnectionPoolLike = {
  getAcpConnection: (engine: AcpEngine) => Promise<AcpConnection>
  trackSession: (engine: AcpEngine, sessionId: string) => void
  replaySessionEvents: (sessionId: string, emit: (n: SessionNotification) => void) => void
  recordSessionUpdate: (engine: AcpEngine, sessionId: string, n: SessionNotification) => void
}
type AcpSessionsLike = {
  create: (i: {
    id: string; taskId: string; engine: AcpEngine; sessionId: string; cwd: string; startedAt: string; createdAt: string
  }) => unknown
  finish: (sessionId: string, patch: { status: string; stopReason: string | null; endedAt: string }) => void
  listByTask: (taskId: string) => unknown[]
  getBySessionId: (sessionId: string) => unknown
}
type TodosLike = {
  setSessionId: (taskId: string, sessionId: string) => void
  updateStatus: (taskId: string, status: string) => void
  getById: (taskId: string) => { id: string; status: string } | undefined
}
type PermissionBridgeLike = {
  requestPermission: (sessionId: string, params: unknown) => Promise<unknown>
  resolvePermission: (requestId: string, optionId: string) => boolean
  rejectAllForSession: (sessionId: string) => void
}
type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type AcpSessionManagerDeps = {
  connectionPool: ConnectionPoolLike
  acpSessions: AcpSessionsLike
  todos: TodosLike
  permissionBridge: PermissionBridgeLike
  broadcast: BroadcastFn
  now: () => string
  genId?: () => string
}

let idSeq = 0

export class AcpSessionManager {
  private activePrompts = new Map<string, Promise<void>>()
  private engineOf = new Map<string, AcpEngine>()

  constructor(private readonly deps: AcpSessionManagerDeps) {}

  async startPrompt(opts: StartPromptOptions): Promise<StartPromptResult> {
    const { taskId, engine, prompt, cwd } = opts
    const connection = await this.deps.connectionPool.getAcpConnection(engine)

    const created = await connection.newSession({ cwd, mcpServers: [] })
    const sessionId = created.sessionId
    this.engineOf.set(sessionId, engine)
    this.deps.connectionPool.trackSession(engine, sessionId)

    const now = this.deps.now()
    const id = this.deps.genId?.() ?? `acp-${++idSeq}`
    this.deps.acpSessions.create({ id, taskId, engine, sessionId, cwd, startedAt: now, createdAt: now })
    this.deps.todos.setSessionId(taskId, sessionId)

    // Why: happy path is permissive; setSessionMode is best-effort (engine may not support it).
    if (typeof connection.setSessionMode === 'function') {
      try {
        await connection.setSessionMode({ sessionId, modeId: 'bypassPermissions' })
      } catch {
        // ignore — mode unsupported
      }
    }

    this.deps.broadcast(
      'acp:session-ready',
      { sessionId, modes: created.modes ?? null, models: created.models ?? [] },
      sessionId
    )

    const run = this.runPrompt(taskId, engine, sessionId, prompt, connection)
    this.activePrompts.set(sessionId, run)
    void run.finally(() => this.activePrompts.delete(sessionId))

    return { sessionId }
  }

  private async runPrompt(
    taskId: string,
    _engine: AcpEngine,
    sessionId: string,
    prompt: string,
    connection: AcpConnection
  ): Promise<void> {
    const { stopReason } = await connection.prompt({
      sessionId,
      prompt: [{ type: 'text', text: prompt }]
    })
    const now = this.deps.now()
    const task = this.deps.todos.getById(taskId)
    if (task?.status === 'in_progress') {
      this.deps.todos.updateStatus(taskId, 'human_review')
    }
    this.deps.acpSessions.finish(sessionId, { status: 'completed', stopReason, endedAt: now })
    this.deps.broadcast('acp:complete', { sessionId, stopReason }, sessionId)
  }

  // Test hook + used by cancel path (13b).
  waitForPrompt(sessionId: string): Promise<void> {
    return this.activePrompts.get(sessionId) ?? Promise.resolve()
  }

  loadHistory(sessionId: string): void {
    this.deps.connectionPool.replaySessionEvents(sessionId, (n) =>
      this.deps.broadcast('acp:update', n, sessionId)
    )
  }

  listSessions(taskId: string): unknown[] {
    return this.deps.acpSessions.listByTask(taskId)
  }
}
```

> 注:`updateStatus` 的真实方法名以任务 3 的 `TodoRepository` 为准(P1 可能叫 `setStatus`/`updateItemStatus`)——**实现时 grep 核对并对齐**(同步改测试里的 mock 方法名)。`connection.newSession` 返回的 `modes`/`models` 形状以任务 1 `.d.ts` 为准。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-manager.test.ts 2>&1 | tail -n 20`
预期:PASS(3 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-session-manager.ts src/main/acp/acp-session-manager.test.ts
git commit -m "feat(acp): add session manager start + happy-path status flow"
```

---

### 任务 13b:会话管理器 acp-session-manager — cancel / 并发锁 / resume / error

**涉及文件：**
- 修改:`src/main/acp/acp-session-manager.ts`
- 修改(追加用例):`src/main/acp/acp-session-manager.test.ts`

> 在 13a 基础上补 4 条边界:(1) 同 session 并发 prompt → 抛错;(2) `cancelSession` → rejectAll + connection.cancel + 等 in-flight + 落库 canceled + emit `acp:task-outcome`;(3) resumeSessionId → resumeSession(失败回退 loadSession);(4) runPrompt 抛错 → 落库 error + emit `acp:error` + `acp:task-outcome`,**不改任务状态**。

- [ ] **第 1 步:写失败的测试(追加到现有 describe 之外)**

```typescript
// append to src/main/acp/acp-session-manager.test.ts
import { AcpSessionManager as _M } from './acp-session-manager' // (already imported above; keep single import in real file)

describe('AcpSessionManager cancel / concurrency / resume / error', () => {
  it('rejects a second prompt on the same session', async () => {
    const d = deps()
    let resolvePrompt: (v: { stopReason: string }) => void = () => {}
    d.connection.prompt.mockImplementation(() => new Promise((r) => { resolvePrompt = r }))
    const mgr = makeManager(d)
    const { sessionId } = await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'a', cwd: '/tmp' })
    await expect(
      mgr.promptExisting(sessionId, 'b')
    ).rejects.toThrow(/in flight/i)
    resolvePrompt({ stopReason: 'end_turn' })
    await mgr.waitForPrompt(sessionId)
  })

  it('cancelSession cancels, finishes canceled, emits task-outcome, leaves status', async () => {
    const d = deps()
    let resolvePrompt: (v: { stopReason: string }) => void = () => {}
    d.connection.prompt.mockImplementation(() => new Promise((r) => { resolvePrompt = r }))
    const mgr = makeManager(d)
    const { sessionId } = await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'SLOW_TEST', cwd: '/tmp' })
    const p = mgr.cancelSession(sessionId)
    resolvePrompt({ stopReason: 'cancelled' })
    await p
    expect(d.connection.cancel).toHaveBeenCalledWith({ sessionId })
    expect(d.acpSessions.finish).toHaveBeenCalledWith(sessionId, expect.objectContaining({ status: 'canceled' }))
    expect(d.broadcast).toHaveBeenCalledWith('acp:task-outcome', expect.objectContaining({ taskId: 'task-1', result: 'canceled' }), 'task-1')
    expect(d.todos.updateStatus).not.toHaveBeenCalled()
  })

  it('resumeSessionId uses resumeSession, falling back to loadSession on failure', async () => {
    const d = deps()
    d.connection.resumeSession.mockRejectedValueOnce(new Error('nope'))
    d.connection.loadSession.mockResolvedValueOnce({ sessionId: 'eng-sess-1' })
    const mgr = makeManager(d)
    const res = await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp', resumeSessionId: 'eng-sess-1' })
    expect(d.connection.resumeSession).toHaveBeenCalled()
    expect(d.connection.loadSession).toHaveBeenCalled()
    expect(d.connection.newSession).not.toHaveBeenCalled()
    expect(res.sessionId).toBe('eng-sess-1')
    await mgr.waitForPrompt('eng-sess-1')
  })

  it('runPrompt error finishes error, emits acp:error + task-outcome, no status change', async () => {
    const d = deps()
    d.connection.prompt.mockRejectedValueOnce(new Error('boom'))
    const mgr = makeManager(d)
    await mgr.startPrompt({ taskId: 'task-1', engine: 'claude', prompt: 'hi', cwd: '/tmp' })
    await mgr.waitForPrompt('eng-sess-1')
    expect(d.acpSessions.finish).toHaveBeenCalledWith('eng-sess-1', expect.objectContaining({ status: 'error' }))
    expect(d.broadcast).toHaveBeenCalledWith('acp:error', expect.objectContaining({ sessionId: 'eng-sess-1', message: expect.stringContaining('boom') }), 'eng-sess-1')
    expect(d.broadcast).toHaveBeenCalledWith('acp:task-outcome', expect.objectContaining({ taskId: 'task-1', result: 'error' }), 'task-1')
    expect(d.todos.updateStatus).not.toHaveBeenCalled()
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-manager.test.ts 2>&1 | tail -n 20`
预期:FAIL(`promptExisting`/`cancelSession`/resume 分支/error 分支缺失)。

- [ ] **第 3 步:改实现**

在 `AcpSessionManager` 上做以下修改:

1. 增加字段追踪 taskId 与 cancel 标记:

```typescript
  private taskOf = new Map<string, string>()
  private canceled = new Set<string>()
```

2. `startPrompt` 中,把 newSession 替换为按 `resumeSessionId` 分支的会话获取,并记录 taskId:

```typescript
    // replace: const created = await connection.newSession({ cwd, mcpServers: [] })
    const created = await this.acquireSession(connection, opts)
    const sessionId = created.sessionId
    this.taskOf.set(sessionId, taskId)
```

3. 新增 `acquireSession`:

```typescript
  private async acquireSession(
    connection: AcpConnection,
    opts: StartPromptOptions
  ): Promise<{ sessionId: string; modes?: unknown; models?: unknown }> {
    if (opts.resumeSessionId) {
      try {
        return await connection.resumeSession({ sessionId: opts.resumeSessionId })
      } catch {
        // Why: resume can fail if the engine dropped the session; loadSession replays from disk.
        return await connection.loadSession({ sessionId: opts.resumeSessionId })
      }
    }
    return connection.newSession({ cwd: opts.cwd, mcpServers: [] })
  }
```

4. `runPrompt` 包 try/catch,并在 catch 里落 error(不改状态):

```typescript
  private async runPrompt(
    taskId: string,
    _engine: AcpEngine,
    sessionId: string,
    prompt: string,
    connection: AcpConnection
  ): Promise<void> {
    try {
      const { stopReason } = await connection.prompt({
        sessionId,
        prompt: [{ type: 'text', text: prompt }]
      })
      const now = this.deps.now()
      if (this.canceled.has(sessionId) || stopReason === 'cancelled') {
        this.deps.acpSessions.finish(sessionId, { status: 'canceled', stopReason: stopReason ?? 'cancelled', endedAt: now })
        this.deps.broadcast('acp:task-outcome', { taskId, sessionId, result: 'canceled' }, taskId)
        return
      }
      const task = this.deps.todos.getById(taskId)
      if (task?.status === 'in_progress') {
        this.deps.todos.updateStatus(taskId, 'human_review')
      }
      this.deps.acpSessions.finish(sessionId, { status: 'completed', stopReason, endedAt: now })
      this.deps.broadcast('acp:complete', { sessionId, stopReason }, sessionId)
    } catch (err) {
      const now = this.deps.now()
      const message = err instanceof Error ? err.message : String(err)
      this.deps.acpSessions.finish(sessionId, { status: 'error', stopReason: message, endedAt: now })
      this.deps.broadcast('acp:error', { sessionId, message }, sessionId)
      this.deps.broadcast('acp:task-outcome', { taskId, sessionId, result: 'error' }, taskId)
    }
  }
```

5. 新增 `promptExisting`(并发锁)与 `cancelSession`:

```typescript
  async promptExisting(sessionId: string, prompt: string): Promise<void> {
    if (this.activePrompts.has(sessionId)) {
      throw new Error('Session already has a prompt in flight')
    }
    const engine = this.engineOf.get(sessionId)
    const taskId = this.taskOf.get(sessionId)
    if (!engine || !taskId) throw new Error('Unknown session')
    const connection = await this.deps.connectionPool.getAcpConnection(engine)
    const run = this.runPrompt(taskId, engine, sessionId, prompt, connection)
    this.activePrompts.set(sessionId, run)
    void run.finally(() => this.activePrompts.delete(sessionId))
    return run
  }

  async cancelSession(sessionId: string): Promise<{ ok: boolean }> {
    const engine = this.engineOf.get(sessionId)
    if (!engine) return { ok: false }
    this.canceled.add(sessionId)
    this.deps.permissionBridge.rejectAllForSession(sessionId)
    const connection = await this.deps.connectionPool.getAcpConnection(engine)
    await connection.cancel({ sessionId })
    await this.waitForPrompt(sessionId)
    return { ok: true }
  }
```

> 注:并发锁测试里第一次 `startPrompt` 已占用 `activePrompts[sessionId]`(prompt 挂起未 resolve),`promptExisting` 命中锁抛错——顺序成立。`cancelSession` 依赖 runPrompt 的 canceled 分支落 canceled;若 mock agent 的 `SLOW_TEST` 返回 `stopReason:'cancelled'`,两条路径(canceled set 或 stopReason)都能命中。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-session-manager.test.ts 2>&1 | tail -n 20`
预期:PASS(13a 3 条 + 13b 4 条 = 7 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-session-manager.ts src/main/acp/acp-session-manager.test.ts
git commit -m "feat(acp): add cancel/concurrency/resume/error to session manager"
```

---

### 任务 14:执行路由 acp-execute-router

**涉及文件：**
- 新建:`src/main/acp/acp-execute-router.ts`
- 测试:`src/main/acp/acp-execute-router.test.ts`

> 统一入口 `executeEnginePrompt(opts)`:claude/qoder → 委托 session-manager 的 `startPrompt`;其它引擎 → 抛 `EngineFallbackNotWired`(P2a 明确不接线,非静默失败)。router 只做分流,不含会话逻辑。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/acp/acp-execute-router.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createExecuteRouter, EngineFallbackNotWired } from './acp-execute-router'

describe('acp-execute-router', () => {
  it('routes claude/qoder to the ACP session manager', async () => {
    const startPrompt = vi.fn().mockResolvedValue({ sessionId: 's1' })
    const router = createExecuteRouter({ sessionManager: { startPrompt } as never })
    const r1 = await router.executeEnginePrompt({ taskId: 't', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    expect(r1).toEqual({ sessionId: 's1' })
    await router.executeEnginePrompt({ taskId: 't', engine: 'qoder', prompt: 'x', cwd: '/tmp' })
    expect(startPrompt).toHaveBeenCalledTimes(2)
  })

  it('throws EngineFallbackNotWired for non-ACP engines', async () => {
    const router = createExecuteRouter({ sessionManager: { startPrompt: vi.fn() } as never })
    await expect(
      router.executeEnginePrompt({ taskId: 't', engine: 'cursor' as never, prompt: 'x', cwd: '/tmp' })
    ).rejects.toThrow(EngineFallbackNotWired)
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-execute-router.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

```typescript
// src/main/acp/acp-execute-router.ts
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

export function createExecuteRouter(deps: { sessionManager: SessionManagerLike }) {
  return {
    async executeEnginePrompt(opts: StartPromptOptions): Promise<StartPromptResult> {
      if (isAcpEngine(opts.engine)) {
        return deps.sessionManager.startPrompt(opts)
      }
      throw new EngineFallbackNotWired(String(opts.engine))
    }
  }
}
```

> 注:`StartPromptOptions.engine` 在 shared 里是 `AcpEngine`(联合窄类型)。测试里传 `'cursor'` 需 `as never` 绕过类型;`isAcpEngine` 在运行时对任意字符串返回 boolean,故 router 运行期分流成立。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-execute-router.test.ts 2>&1 | tail -n 20`
预期:PASS(2 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-execute-router.ts src/main/acp/acp-execute-router.test.ts
git commit -m "feat(acp): add execute router (ACP dispatch + EngineFallbackNotWired)"
```

---

### 任务 15:runtime 注入 getAcpSessionRepository + 单例内核

**涉及文件：**
- 修改:`src/main/runtime/orca-runtime.ts`(参照 `_todoRepository` getter,约 line 2170 字段 / line 2909 getter)

> runtime 提供 `getAcpSessionRepository()`(仿 `getTodoRepository()`)。session-manager / connection-pool / permission-bridge / execute-router 的单例组装也放 runtime,提供 `getAcpExecuteRouter()` 与 `getAcpSessionManager()`,供 IPC 层(任务 16)取用。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/acp/acp-runtime-wiring.test.ts
import { describe, it, expect } from 'vitest'
import { buildAcpKernel } from './acp-kernel'

// buildAcpKernel wires pool+manager+router+bridge from injected repos, no electron deps.
describe('buildAcpKernel', () => {
  it('produces an execute router backed by the session manager', async () => {
    const acpSessions = { create: () => ({}), finish: () => {}, listByTask: () => [], getBySessionId: () => undefined }
    const todos = { setSessionId: () => {}, updateStatus: () => {}, getById: () => ({ id: 't', status: 'in_progress' }) }
    const kernel = buildAcpKernel({
      acpSessions: acpSessions as never,
      todos: todos as never,
      broadcast: () => {},
      now: () => '2026-07-11T00:00:00.000Z'
    })
    expect(typeof kernel.executeRouter.executeEnginePrompt).toBe('function')
    expect(typeof kernel.sessionManager.cancelSession).toBe('function')
    expect(kernel.connectionPool).toBeTruthy()
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-runtime-wiring.test.ts 2>&1 | tail -n 20`
预期:FAIL(`acp-kernel` 不存在)。

- [ ] **第 3 步:写最小实现**

先建组装工厂(把 electron 依赖挡在 runtime 之外,保持 kernel 可测):

```typescript
// src/main/acp/acp-kernel.ts
import { AcpConnectionPool } from './acp-connection-pool'
import { AcpPermissionBridge } from './acp-permission-bridge'
import { AcpSessionManager } from './acp-session-manager'
import { createExecuteRouter } from './acp-execute-router'

type BroadcastFn = (channel: string, payload: unknown, scopeId?: string) => void

export type BuildAcpKernelDeps = {
  acpSessions: ConstructorParameters<typeof AcpSessionManager>[0]['acpSessions']
  todos: ConstructorParameters<typeof AcpSessionManager>[0]['todos']
  broadcast: BroadcastFn
  now: () => string
}

export function buildAcpKernel(deps: BuildAcpKernelDeps) {
  const connectionPool = new AcpConnectionPool()
  const permissionBridge = new AcpPermissionBridge(deps.broadcast)
  const sessionManager = new AcpSessionManager({
    connectionPool: connectionPool as never,
    acpSessions: deps.acpSessions,
    todos: deps.todos,
    permissionBridge: permissionBridge as never,
    broadcast: deps.broadcast,
    now: deps.now
  })
  const executeRouter = createExecuteRouter({ sessionManager })
  return { connectionPool, permissionBridge, sessionManager, executeRouter }
}
```

然后在 `orca-runtime.ts` 加字段与 getter(仿 `_todoRepository`):

```typescript
  // field (near _todoRepository, ~line 2170)
  private _acpSessionRepository: AcpSessionRepository | null = null
  private _acpKernel: ReturnType<typeof buildAcpKernel> | null = null
```

```typescript
  // getters (near getTodoRepository, ~line 2909)
  getAcpSessionRepository(): AcpSessionRepository {
    if (!this._acpSessionRepository) {
      this._acpSessionRepository = new AcpSessionRepository(
        new AcpSessionDatabase(join(app.getPath('userData'), 'acp-sessions.db'))
      )
    }
    return this._acpSessionRepository
  }

  getAcpKernel(): ReturnType<typeof buildAcpKernel> {
    if (!this._acpKernel) {
      this._acpKernel = buildAcpKernel({
        acpSessions: this.getAcpSessionRepository() as never,
        todos: this.getTodoRepository() as never,
        broadcast: broadcastAcpEvent,
        now: () => new Date().toISOString()
      })
    }
    return this._acpKernel
  }
```

加相应 import:

```typescript
import { AcpSessionRepository } from '../acp/acp-session-repository'
import { AcpSessionDatabase } from '../acp/acp-session-database'
import { buildAcpKernel } from '../acp/acp-kernel'
import { broadcastAcpEvent } from '../acp/acp-renderer-events'
```

> 注:`orca-runtime.ts` 极大(~963KB),**用 grep 定位** `_todoRepository`/`getTodoRepository` 的确切行,只在其邻近插入,勿整文件重排。`join` 与 `app` 若文件顶部已 import 则复用,勿重复。

- [ ] **第 4 步:跑测试,确认通过 + typecheck**

运行:`npx vitest run --config config/vitest.config.ts src/main/acp/acp-runtime-wiring.test.ts 2>&1 | tail -n 20`
预期:PASS。
运行:`pnpm typecheck 2>&1 | tail -n 20`
预期:无新增错误。

- [ ] **第 5 步:提交**

```bash
git add src/main/acp/acp-kernel.ts src/main/acp/acp-runtime-wiring.test.ts src/main/runtime/orca-runtime.ts
git commit -m "feat(acp): wire acp kernel + session repository into runtime"
```

---

### 任务 16:IPC 处理器 ipc/acp.ts + 注册接线

**涉及文件：**
- 新建:`src/main/ipc/acp.ts`
- 测试:`src/main/ipc/acp.test.ts`
- 修改:`src/main/ipc/register-core-handlers.ts`(import + 调用,仿 `registerTodoHandlers`)

> 5 个 channel(§5.1):`acp:execute`/`acp:cancel`/`acp:resolve-permission`/`acp:list-sessions`/`acp:load-history`。deps 经 runtime 注入。为可测,`registerAcpHandlers` 接受注入的 `ipcMain`(仿 orca 现有可测 IPC 模式;若 todos.ts 直接用全局 `ipcMain`,则本任务测试用 `vi.mock('electron')` 打桩 `ipcMain.handle` 并断言注册与转发)。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/main/ipc/acp.test.ts
import { describe, it, expect, vi } from 'vitest'
import { registerAcpHandlers } from './acp'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>()
  return {
    ipcMain: { handle: (ch: string, fn: (e: unknown, arg: unknown) => unknown) => handlers.set(ch, fn) },
    invoke: (ch: string, arg: unknown) => handlers.get(ch)!({}, arg),
    handlers
  }
}

describe('registerAcpHandlers', () => {
  it('acp:execute delegates to executeRouter', async () => {
    const f = fakeIpc()
    const executeEnginePrompt = vi.fn().mockResolvedValue({ sessionId: 's1' })
    registerAcpHandlers(
      {
        executeRouter: { executeEnginePrompt } as never,
        sessionManager: { cancelSession: vi.fn(), listSessions: vi.fn(), loadHistory: vi.fn() } as never,
        permissionBridge: { resolvePermission: vi.fn() } as never
      },
      f.ipcMain as never
    )
    const res = await f.invoke('acp:execute', { taskId: 't', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    expect(executeEnginePrompt).toHaveBeenCalledWith(expect.objectContaining({ taskId: 't', engine: 'claude' }))
    expect(res).toEqual({ sessionId: 's1' })
  })

  it('acp:cancel / list-sessions / load-history / resolve-permission wire through', async () => {
    const f = fakeIpc()
    const sessionManager = {
      cancelSession: vi.fn().mockResolvedValue({ ok: true }),
      listSessions: vi.fn().mockReturnValue([{ id: 'a' }]),
      loadHistory: vi.fn()
    }
    const permissionBridge = { resolvePermission: vi.fn().mockReturnValue(true) }
    registerAcpHandlers(
      { executeRouter: { executeEnginePrompt: vi.fn() } as never, sessionManager: sessionManager as never, permissionBridge: permissionBridge as never },
      f.ipcMain as never
    )
    expect(await f.invoke('acp:cancel', { sessionId: 's1' })).toEqual({ ok: true })
    expect(await f.invoke('acp:list-sessions', { taskId: 't' })).toEqual([{ id: 'a' }])
    await f.invoke('acp:load-history', { sessionId: 's1' })
    expect(sessionManager.loadHistory).toHaveBeenCalledWith('s1')
    expect(await f.invoke('acp:resolve-permission', { requestId: 'r1', optionId: 'allow' })).toEqual({ ok: true })
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/main/ipc/acp.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

```typescript
// src/main/ipc/acp.ts
import { ipcMain as defaultIpcMain } from 'electron'
import type { StartPromptOptions } from '../../shared/acp/acp-session'

type ExecuteRouterLike = {
  executeEnginePrompt: (opts: StartPromptOptions) => Promise<{ sessionId: string }>
}
type SessionManagerLike = {
  cancelSession: (sessionId: string) => Promise<{ ok: boolean }>
  listSessions: (taskId: string) => unknown[]
  loadHistory: (sessionId: string) => void
}
type PermissionBridgeLike = {
  resolvePermission: (requestId: string, optionId: string) => boolean
}

export type AcpHandlerDeps = {
  executeRouter: ExecuteRouterLike
  sessionManager: SessionManagerLike
  permissionBridge: PermissionBridgeLike
}

type IpcMainLike = { handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void }

export function registerAcpHandlers(
  deps: AcpHandlerDeps,
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('acp:execute', (_e, arg: StartPromptOptions) =>
    deps.executeRouter.executeEnginePrompt(arg)
  )
  ipcMain.handle('acp:cancel', (_e, arg: { sessionId: string }) =>
    deps.sessionManager.cancelSession(arg.sessionId)
  )
  ipcMain.handle('acp:resolve-permission', (_e, arg: { requestId: string; optionId: string }) => ({
    ok: deps.permissionBridge.resolvePermission(arg.requestId, arg.optionId)
  }))
  ipcMain.handle('acp:list-sessions', (_e, arg: { taskId: string }) =>
    deps.sessionManager.listSessions(arg.taskId)
  )
  ipcMain.handle('acp:load-history', (_e, arg: { sessionId: string }) => {
    deps.sessionManager.loadHistory(arg.sessionId)
  })
}
```

在 `register-core-handlers.ts` 接线(仿 line 196 `registerTodoHandlers`):

```typescript
import { registerAcpHandlers } from './acp'
// ... 在 registerTodoHandlers 之后:
  const acpKernel = runtime.getAcpKernel()
  registerAcpHandlers({
    executeRouter: acpKernel.executeRouter,
    sessionManager: acpKernel.sessionManager,
    permissionBridge: acpKernel.permissionBridge
  })
```

> 注:orca 的 `ipcMain.handle` 若已在别处对同 channel 注册会抛错;`registered` 守卫(文件顶部)已防重复。`registerAcpHandlers` 默认参数用真实 `ipcMain`,测试传 fake,不改变生产路径。

- [ ] **第 4 步:跑测试,确认通过**

运行:`npx vitest run --config config/vitest.config.ts src/main/ipc/acp.test.ts 2>&1 | tail -n 20`
预期:PASS(2 用例)。

- [ ] **第 5 步:提交**

```bash
git add src/main/ipc/acp.ts src/main/ipc/acp.test.ts src/main/ipc/register-core-handlers.ts
git commit -m "feat(acp): add IPC handlers and register in core handlers"
```

---

### 任务 17:preload 暴露 window.api.acp + 类型

**涉及文件：**
- 修改:`src/preload/index.ts`(仿 line 4228-4257 todos block)
- 修改:`src/preload/api-types.ts`

> 暴露 `window.api.acp = { execute, cancel, resolvePermission, listSessions, loadHistory, onSessionReady, onUpdate, onComplete, onError, onPermissionRequest, onTaskOutcome }`。invoke 型直接 `ipcRenderer.invoke`;事件订阅型返回 cleanup(仿 todos 的 `removeListener` 模式)。签名进 `api-types.ts`。

- [ ] **第 1 步:写失败的测试**

```typescript
// src/preload/acp-api-shape.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createAcpApi } from './acp-api'

describe('createAcpApi', () => {
  it('invoke methods call ipcRenderer.invoke with the right channels', async () => {
    const invoke = vi.fn().mockResolvedValue({ sessionId: 's1' })
    const on = vi.fn()
    const removeListener = vi.fn()
    const api = createAcpApi({ invoke, on, removeListener } as never)
    await api.execute({ taskId: 't', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    expect(invoke).toHaveBeenCalledWith('acp:execute', { taskId: 't', engine: 'claude', prompt: 'x', cwd: '/tmp' })
    await api.cancel({ sessionId: 's1' })
    expect(invoke).toHaveBeenCalledWith('acp:cancel', { sessionId: 's1' })
  })

  it('event subscriptions register a listener and return a cleanup that removes it', () => {
    const invoke = vi.fn()
    const on = vi.fn()
    const removeListener = vi.fn()
    const api = createAcpApi({ invoke, on, removeListener } as never)
    const cb = vi.fn()
    const cleanup = api.onComplete('s1', cb)
    expect(on).toHaveBeenCalledWith('acp:complete:s1', expect.any(Function))
    cleanup()
    expect(removeListener).toHaveBeenCalledWith('acp:complete:s1', expect.any(Function))
  })
})
```

- [ ] **第 2 步:跑测试,确认失败**

运行:`npx vitest run --config config/vitest.config.ts src/preload/acp-api-shape.test.ts 2>&1 | tail -n 20`
预期:FAIL(模块不存在)。

- [ ] **第 3 步:写最小实现**

抽出可测工厂(preload 主文件仅调用它,保持 index.ts 薄):

```typescript
// src/preload/acp-api.ts
import type { StartPromptOptions } from '../shared/acp/acp-session'

type IpcRendererLike = {
  invoke: (channel: string, arg?: unknown) => Promise<unknown>
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => void
  removeListener: (channel: string, listener: (event: unknown, payload: unknown) => void) => void
}

function subscribe(
  ipc: IpcRendererLike,
  channel: string,
  cb: (payload: unknown) => void
): () => void {
  const listener = (_e: unknown, payload: unknown): void => cb(payload)
  ipc.on(channel, listener)
  return () => ipc.removeListener(channel, listener)
}

export function createAcpApi(ipc: IpcRendererLike) {
  return {
    execute: (opts: StartPromptOptions) => ipc.invoke('acp:execute', opts),
    cancel: (arg: { sessionId: string }) => ipc.invoke('acp:cancel', arg),
    resolvePermission: (arg: { requestId: string; optionId: string }) =>
      ipc.invoke('acp:resolve-permission', arg),
    listSessions: (arg: { taskId: string }) => ipc.invoke('acp:list-sessions', arg),
    loadHistory: (arg: { sessionId: string }) => ipc.invoke('acp:load-history', arg),
    onSessionReady: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:session-ready:${sessionId}`, cb),
    onUpdate: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:update:${sessionId}`, cb),
    onComplete: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:complete:${sessionId}`, cb),
    onError: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:error:${sessionId}`, cb),
    onPermissionRequest: (sessionId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:permission-request:${sessionId}`, cb),
    onTaskOutcome: (taskId: string, cb: (p: unknown) => void) =>
      subscribe(ipc, `acp:task-outcome:${taskId}`, cb)
  }
}

export type AcpApi = ReturnType<typeof createAcpApi>
```

在 `src/preload/index.ts` 里用它(仿 todos block):

```typescript
import { createAcpApi } from './acp-api'
// ... 在 api 对象里:
  acp: createAcpApi(ipcRenderer),
```

在 `src/preload/api-types.ts` 加类型:

```typescript
import type { AcpApi } from './acp-api'
// ... 在 Api 接口里:
  acp: AcpApi
```

> 注:`api-types.ts` 的实际接口名以文件现状为准(可能叫 `PreloadApi`/`WindowApi`)——**实现时读文件核对**并把 `acp: AcpApi` 加到正确接口。`ipcRenderer` 在 index.ts 已 import,复用。

- [ ] **第 4 步:跑测试通过 + typecheck**

运行:`npx vitest run --config config/vitest.config.ts src/preload/acp-api-shape.test.ts 2>&1 | tail -n 20`
预期:PASS(2 用例)。
运行:`pnpm typecheck 2>&1 | tail -n 20`
预期:无新增错误。

- [ ] **第 5 步:提交**

```bash
git add src/preload/acp-api.ts src/preload/acp-api-shape.test.ts src/preload/index.ts src/preload/api-types.ts
git commit -m "feat(acp): expose window.api.acp with typed signatures"
```

---

### 任务 18:端到端集成测试(mock agent 全链路)+ 最终验证

**涉及文件：**
- 新建:`src/main/acp/acp-kernel-e2e.test.ts`

> 用**真 spawn mock agent**(`DMON_ACP_MOCK=1`)+ 真 connection-pool + 真 session-manager,跑通 execute → sessionUpdate → complete 的全链路,以及 SLOW_TEST + cancel。这是唯一触真 stdio 的测试;用内存 fake repo,不落真 DB。**若 CI 无法 spawn(缺 electron node 环境),用 `it.skip` 标注并在注释说明本地必跑。**

- [ ] **第 1 步:写集成测试**

```typescript
// src/main/acp/acp-kernel-e2e.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { buildAcpKernel } from './acp-kernel'

const RUN_E2E = process.env.DMON_ACP_E2E === '1'

// Why: exercises real stdio against the mock agent; opt-in to avoid CI spawn flakiness.
describe.skipIf(!RUN_E2E)('acp kernel e2e (mock agent)', () => {
  beforeAll(() => { process.env.DMON_ACP_MOCK = '1' })
  afterAll(() => { delete process.env.DMON_ACP_MOCK })

  function memoryRepos() {
    const rows: Record<string, unknown> = {}
    const acpSessions = {
      create: (i: { sessionId: string }) => { rows[i.sessionId] = { ...i, status: 'running' }; return rows[i.sessionId] },
      finish: (sid: string, patch: object) => { rows[sid] = { ...(rows[sid] as object), ...patch } },
      listByTask: () => Object.values(rows),
      getBySessionId: (sid: string) => rows[sid]
    }
    const todos = { setSessionId: vi.fn(), updateStatus: vi.fn(), getById: () => ({ id: 't', status: 'in_progress' }) }
    return { acpSessions, todos, rows }
  }

  it('runs a full prompt cycle to completion', async () => {
    const { acpSessions, todos } = memoryRepos()
    const events: Array<[string, unknown]> = []
    const kernel = buildAcpKernel({
      acpSessions: acpSessions as never,
      todos: todos as never,
      broadcast: (c, p) => events.push([c, p]),
      now: () => new Date().toISOString()
    })
    const { sessionId } = await kernel.executeRouter.executeEnginePrompt({ taskId: 't', engine: 'claude', prompt: 'hello', cwd: process.cwd() })
    await kernel.sessionManager.waitForPrompt(sessionId)
    expect(events.some(([c]) => c === 'acp:complete')).toBe(true)
    expect(todos.updateStatus).toHaveBeenCalledWith('t', 'human_review')
  }, 15000)

  it('cancels a SLOW_TEST prompt', async () => {
    const { acpSessions, todos } = memoryRepos()
    const events: Array<[string, unknown]> = []
    const kernel = buildAcpKernel({
      acpSessions: acpSessions as never,
      todos: todos as never,
      broadcast: (c, p) => events.push([c, p]),
      now: () => new Date().toISOString()
    })
    const { sessionId } = await kernel.executeRouter.executeEnginePrompt({ taskId: 't', engine: 'claude', prompt: 'SLOW_TEST', cwd: process.cwd() })
    await kernel.sessionManager.cancelSession(sessionId)
    expect(events.some(([c, p]) => c === 'acp:task-outcome' && (p as { result: string }).result === 'canceled')).toBe(true)
  }, 15000)
})
```

- [ ] **第 2 步:跑测试(opt-in)**

运行:`DMON_ACP_E2E=1 npx vitest run --config config/vitest.config.ts src/main/acp/acp-kernel-e2e.test.ts 2>&1 | tail -n 30`
预期:PASS(2 用例);若本地 spawn 失败,记录原因并回到任务 12 `defaultConnect` / 任务 9 mock 修正。

- [ ] **第 3 步:全域 scoped 验证**

运行(分开跑,避免大输出):
```bash
npx vitest run --config config/vitest.config.ts src/main/acp 2>&1 | tail -n 25
npx vitest run --config config/vitest.config.ts src/main/todos 2>&1 | tail -n 15
npx vitest run --config config/vitest.config.ts src/main/ipc/acp.test.ts src/preload/acp-api-shape.test.ts 2>&1 | tail -n 15
pnpm typecheck 2>&1 | tail -n 20
```
预期:全 PASS,typecheck 无新增错误。

- [ ] **第 4 步:提交**

```bash
git add src/main/acp/acp-kernel-e2e.test.ts
git commit -m "test(acp): add mock-agent e2e integration (opt-in)"
```

- [ ] **第 5 步:收尾**

用 `ddd-finishing-a-development-branch` 决定合并/PR/清理。P2a 完成标志:任务 1-18 全绿、typecheck 通过、`window.api.acp.*` 与 `acp:*` 事件契约稳定,供 P2b 消费。

---

## 自我评审

**1. 规格覆盖**(spec §1-§9 → 任务映射):

| Spec 条目 | 覆盖任务 |
|---|---|
| §2 模块:acp-agent-launcher | 任务 7 |
| §2 模块:acp-connection-pool(单例/缓存/replay/exit 清理) | 任务 12 |
| §2 模块:acp-session-manager(生命周期/并发锁/状态流转/落库) | 任务 13a+13b |
| §2 模块:acp-permission-bridge | 任务 10 |
| §2 模块:acp-execute-router | 任务 14 |
| §2 模块:acp-types(AcpEngine 等本地类型) | 任务 2(shared/acp/acp-session.ts) |
| §2.1 连接与会话生命周期 | 任务 12 + 13a/13b |
| §3.1 独立库 acp-sessions.db(db/repo/mapping) | 任务 4/5/6 |
| §3.2 todo 库迁移 session_id | 任务 3 |
| §4 状态自动流转(happy=human_review / error/canceled 不改) | 任务 13a(happy)+13b(error/cancel) |
| §5.1 IPC 5 channel | 任务 16 |
| §5.2 preload | 任务 17 |
| §5.3 渲染层事件(6 事件 + scoped 双频道) | 任务 8(广播)+ 各 emit 点(13a/13b/10) |
| §6 权限(默认放行 + 交互契约) | 任务 10 |
| §7 测试(mock agent + 各单测) | 任务 9 + 各任务 TDD |
| §8 错误边界(crash/并发/resume 失败/未知引擎) | 任务 12(exit)/13b(并发/resume/error)/14(未知引擎) |
| §1.2 首批引擎 claude/qoder + SDK 安装 | 任务 1 + 7 |
| Client 侧 fs/permission 能力 | 任务 11 |
| runtime 注入 | 任务 15 |

无遗漏。

**2. 占位符扫描**:全任务步骤均含完整代码块与精确命令。凡"以 SDK `.d.ts` 为准 / grep 核对真实方法名"处,均为**已知的实现期对齐点**(非 TBD),且给了核对方法与回退策略——保留是有意的(SDK 未安装,形状须实测)。

**3. 类型一致性**:`AcpEngine`/`AcpSessionRecord`/`StartPromptOptions`/`StartPromptResult`/`AcpConnection`/`PermissionOutcome` 均在任务 2/10 定义,后续任务(6/12/13/14/16/17)一致引用。`buildAcpKernel` 用 `ConstructorParameters<typeof AcpSessionManager>` 保证 repo 形状与 manager 构造签名同源。跨层字段名(`sessionId`/`taskId`/`stopReason`/`endedAt`/`status`)贯穿 shared→repo→manager→ipc→preload 一致。

**已知实现期风险(非计划缺陷)**:(a) ACP SDK 的 Client 接口与 connection 方法形状须以安装后 `.d.ts` 为准,各处已注明对齐点;(b) `findBinary`/`TodoRepository.updateStatus` 真实签名须 grep 核对;(c) e2e 与 launcher 真机用例在无引擎/无 SDK 的 CI 环境用 skip 降级,必过用例不依赖真机。
