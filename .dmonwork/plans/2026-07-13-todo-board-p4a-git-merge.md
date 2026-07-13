# TODO Board P4a — merging 态接真实 git 合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TODO 任务在 `merging` 状态下执行真实的本地 git 合并（cwd 当前分支 → 基准分支），成功置 `done`，冲突/失败 abort 回退 `rework`。

**Architecture:** 三个可单测的主进程模块——纯函数计划 `resolveTaskMergePlan`、注入式 git 事实解析 `resolveTaskGitFacts`、注入式合并执行 `executeTaskMerge`——由一个瘦 IPC 模块 `todo-merge.ts` 组合；渲染层新增 `MergingPanel` 挂到 `TodoDetailView` 的 `merging` 分支，复刻 P3 `HumanReviewPanel` 的接法。git 通过 `gitExecFileAsync`（自带 WSL 路径翻译）绑定到任务 cwd 执行。

**Tech Stack:** Electron 主进程 (TypeScript) + ipcMain、`src/main/git/runner.ts` `gitExecFileAsync`、`src/shared/git-branch-cleanup.ts`；React + Zustand 渲染层；vitest（happy-dom + node）；i18n `translate()` + `sync:localization-catalog`。

**Spec:** `.dmonwork/specs/2026-07-13-todo-board-p4a-git-merge-design.md`

---

## 关键既有事实（实现前必读，均已核实）

- **任务 cwd 取法**：`acpKernel.sessionManager.listSessions(taskId)` 返回 `AcpSessionRecord[]`（`ORDER BY created_at DESC`），取 `[0].cwd`。类型 `AcpSessionRecord` 在 `src/shared/acp/acp-session.ts`，含 `cwd: string`。对齐 `src/main/acp/review-port-scan.ts:19`。
- **git 执行器**：`gitExecFileAsync(args: string[], options: { cwd?: string; ... }): Promise<{ stdout: string; stderr: string }>`（`src/main/git/runner.ts:798`）。**非零退出会 throw**。自带 WSL 路径翻译。
- **基准分支候选**：`getBranchCleanupTargetRefs(runGit, branchName): Promise<string[]>`（`src/shared/git-branch-cleanup.ts:44`），其中 `runGit` 类型 `GitBranchCleanupExec = (argv, options?) => Promise<{ stdout: string }>`。
- **IPC 注册模式**：仿 `src/main/ipc/todo-review.ts` + `src/main/ipc/register-core-handlers.ts:208-217`（`registerTodoReviewHandlers({ ... })`）。
- **preload 绑定模式**：`src/preload/api-types.ts:3106`（`review: { scanPorts: ... }`）+ `src/preload/index.ts:4234`（`review: { scanPorts: (input) => ipcRenderer.invoke('todos:review.scanPorts', input) }`）。
- **详情面板接法**：`src/renderer/src/components/todo/detail/TodoDetailView.tsx:56-62` 现有 `in_progress` / `human_review` 分支；`HumanReviewPanel.tsx` 是复刻范本。
- **状态置位**：渲染层 `useAppStore((s) => s.updateTodoItem)`；调用 `void updateTodoItem(item.id, { status: 'done' | 'rework' })`（见 `ReviewDecisionBar.tsx:16,20,24`）。
- **状态类型**：`TodoStatus` 与 `TodoItem` 在 `src/shared/todo/todo-status.ts` / `src/shared/todo/todo-item.ts`。
- **i18n**：`translate('auto.components.todo.detail.MergingPanel.<key>', '<fallback>')`；新增 key 后运行 `pnpm run sync:localization-catalog`；`translate()` 在测试里返回英文 fallback（正则查询用 fallback 文案）。
- **测试命令**：`npx vitest run --config config/vitest.config.ts <path>`。
- **electron 依赖测试仅 CI 跑**（本地无法装 Electron 二进制）。`todo-merge.ts` IPC 若只 import `electron` 的 `ipcMain`，可像 `todo-review.ts` 那样把 `ipcMain` 作为可注入参数，从而让 handler 逻辑测试不 import electron；但本计划把可测逻辑全部放进 plan/git-facts/executor 三个纯/注入模块，IPC 仅做组合，故 IPC 不单独写本地测试。

---

## File Structure

**新建（主进程）**
- `src/shared/todo/todo-merge.ts` — 共享类型：`MergePlanReason` / `MergePlan` / `MergeOutcome` / `TaskGitFacts`。主进程 + preload + 渲染层共用。
- `src/main/todos/todo-merge-plan.ts` — 纯函数 `resolveTaskMergePlan(facts) → MergePlan`。
- `src/main/todos/todo-merge-git-facts.ts` — `resolveTaskGitFacts({ runGit }) → TaskGitFacts`（注入 runGit，解析 repoRoot / sourceBranch / targetBranch）。
- `src/main/todos/todo-merge-executor.ts` — `executeTaskMerge({ runGit, plan }) → MergeOutcome`（注入 runGit，执行合并）。
- `src/main/ipc/todo-merge.ts` — `registerTodoMergeHandlers(deps, ipcMain?)`，channels `todos:merge.preview` / `todos:merge.execute`。

**新建（渲染层）**
- `src/renderer/src/components/todo/detail/MergingPanel.tsx`

**新建（测试）**
- `src/main/todos/todo-merge-plan.test.ts`
- `src/main/todos/todo-merge-git-facts.test.ts`
- `src/main/todos/todo-merge-executor.test.ts`
- `src/renderer/src/components/todo/detail/MergingPanel.test.tsx`

**修改**
- `src/preload/api-types.ts` — 在 `todos` 的 `review` 旁加 `merge` 块。
- `src/preload/index.ts` — 同上，加 `merge` 绑定。
- `src/main/ipc/register-core-handlers.ts` — import + 调用 `registerTodoMergeHandlers(...)`。
- `src/renderer/src/components/todo/detail/TodoDetailView.tsx` — 加 `merging` 分支渲染 `MergingPanel`。
- `src/renderer/src/components/todo/detail/TodoDetailView.test.tsx` — 加 `merging` 渲染断言。
- 五个 locale 文件（经 `sync:localization-catalog` 自动补全）。

---

## Task 1: 共享类型

**Files:**
- Create: `src/shared/todo/todo-merge.ts`

- [ ] **Step 1: 写类型文件**

```ts
// src/shared/todo/todo-merge.ts
// P4a: shared shapes for task merge preview/execute across main, preload, renderer.

export type MergePlanReason =
  | 'ok' // applicable: 源≠目标且能合并
  | 'no-session' // task 无关联 ACP session / cwd
  | 'not-a-repo' // cwd 不在 git 仓库
  | 'detached-head' // 源为游离 HEAD,无分支名
  | 'already-on-base' // 源 == 目标,无需合并
  | 'no-base' // 找不到本地基准分支

export type TaskGitFacts = {
  repoRoot: string | null
  sourceBranch: string | null // null = detached / not-a-repo
  targetBranch: string | null // 本地基准分支名; null = 无
}

export type MergePlan = {
  taskId: string
  applicable: boolean
  reason: MergePlanReason
  repoRoot: string | null
  sourceBranch: string | null
  targetBranch: string | null
}

export type MergeOutcome =
  | { outcome: 'merged'; strategy: 'fast-forward' | 'merge-commit'; deletedBranch: string | null }
  | { outcome: 'conflict'; conflictFiles: string[] }
  | { outcome: 'error'; message: string }
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS（新文件无引用错误）

- [ ] **Step 3: Commit**

```bash
git add src/shared/todo/todo-merge.ts
git commit -m "feat(todo-p4a): add shared merge plan/outcome types"
```

---

## Task 2: 纯函数 resolveTaskMergePlan

**Files:**
- Create: `src/main/todos/todo-merge-plan.ts`
- Test: `src/main/todos/todo-merge-plan.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/main/todos/todo-merge-plan.test.ts
import { describe, it, expect } from 'vitest'
import { resolveTaskMergePlan } from './todo-merge-plan'
import type { TaskGitFacts } from '../../shared/todo/todo-merge'

const facts = (over: Partial<TaskGitFacts>): TaskGitFacts => ({
  repoRoot: '/repo',
  sourceBranch: 'feature-x',
  targetBranch: 'main',
  ...over
})

describe('resolveTaskMergePlan', () => {
  it('ok when source != target and both resolved', () => {
    const p = resolveTaskMergePlan('t1', facts({}))
    expect(p).toEqual({
      taskId: 't1',
      applicable: true,
      reason: 'ok',
      repoRoot: '/repo',
      sourceBranch: 'feature-x',
      targetBranch: 'main'
    })
  })

  it('not-a-repo when repoRoot is null', () => {
    const p = resolveTaskMergePlan('t1', facts({ repoRoot: null, sourceBranch: null, targetBranch: null }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('not-a-repo')
  })

  it('detached-head when sourceBranch is null but repo exists', () => {
    const p = resolveTaskMergePlan('t1', facts({ sourceBranch: null }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('detached-head')
  })

  it('no-base when targetBranch is null', () => {
    const p = resolveTaskMergePlan('t1', facts({ targetBranch: null }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('no-base')
  })

  it('already-on-base when source == target', () => {
    const p = resolveTaskMergePlan('t1', facts({ sourceBranch: 'main', targetBranch: 'main' }))
    expect(p.applicable).toBe(false)
    expect(p.reason).toBe('already-on-base')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-merge-plan.test.ts`
Expected: FAIL（`resolveTaskMergePlan` 未定义 / 模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/main/todos/todo-merge-plan.ts
import type { MergePlan, TaskGitFacts } from '../../shared/todo/todo-merge'

// Pure: derive an actionable merge plan from resolved git facts. No I/O.
export function resolveTaskMergePlan(taskId: string, facts: TaskGitFacts): MergePlan {
  const base = {
    taskId,
    repoRoot: facts.repoRoot,
    sourceBranch: facts.sourceBranch,
    targetBranch: facts.targetBranch
  }
  if (!facts.repoRoot) {
    return { ...base, applicable: false, reason: 'not-a-repo' }
  }
  if (!facts.sourceBranch) {
    return { ...base, applicable: false, reason: 'detached-head' }
  }
  if (!facts.targetBranch) {
    return { ...base, applicable: false, reason: 'no-base' }
  }
  if (facts.sourceBranch === facts.targetBranch) {
    return { ...base, applicable: false, reason: 'already-on-base' }
  }
  return { ...base, applicable: true, reason: 'ok' }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-merge-plan.test.ts`
Expected: PASS（5 passed）

- [ ] **Step 5: Commit**

```bash
git add src/main/todos/todo-merge-plan.ts src/main/todos/todo-merge-plan.test.ts
git commit -m "feat(todo-p4a): add pure resolveTaskMergePlan"
```

---

## Task 3: git 事实解析 resolveTaskGitFacts

**Files:**
- Create: `src/main/todos/todo-merge-git-facts.ts`
- Test: `src/main/todos/todo-merge-git-facts.test.ts`

说明：`runGit(argv) => Promise<{ stdout: string }>`，与 `GitBranchCleanupExec` 兼容（`getBranchCleanupTargetRefs` 直接吃它）。`runGit` 约定：git 命令失败时 **throw**（模拟 `gitExecFileAsync`）。目标分支归一为**存在的本地分支名**。

- [ ] **Step 1: 写失败测试**

```ts
// src/main/todos/todo-merge-git-facts.test.ts
import { describe, it, expect } from 'vitest'
import { resolveTaskGitFacts } from './todo-merge-git-facts'

// mock runGit: map of exact "argv.join(' ')" -> stdout, throw if not present
function makeRunGit(map: Record<string, string>) {
  return async (argv: string[]): Promise<{ stdout: string }> => {
    const key = argv.join(' ')
    if (key in map) return { stdout: map[key] }
    throw new Error(`git failed: ${key}`)
  }
}

describe('resolveTaskGitFacts', () => {
  it('resolves repoRoot, source, and target from branch.<n>.base', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feature-x\n',
      'config --get branch.feature-x.base': 'main\n',
      'show-ref --verify --quiet refs/heads/main': ''
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts).toEqual({ repoRoot: '/repo', sourceBranch: 'feature-x', targetBranch: 'main' })
  })

  it('falls back to origin/HEAD when no configured base', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feature-x\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'show-ref --verify --quiet refs/heads/main': ''
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts.targetBranch).toBe('main')
  })

  it('returns not-a-repo facts when show-toplevel fails', async () => {
    const runGit = makeRunGit({})
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts).toEqual({ repoRoot: null, sourceBranch: null, targetBranch: null })
  })

  it('returns detached-head facts when HEAD has no branch name', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'HEAD\n'
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts).toEqual({ repoRoot: '/repo', sourceBranch: null, targetBranch: null })
  })

  it('targetBranch null when candidate local branch does not exist', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'feature-x\n',
      'config --get branch.feature-x.base': 'main\n'
      // no show-ref for refs/heads/main -> not a local branch
    })
    const facts = await resolveTaskGitFacts({ runGit })
    expect(facts.targetBranch).toBeNull()
  })

  it('does not pick the source branch itself as target', async () => {
    const runGit = makeRunGit({
      'rev-parse --show-toplevel': '/repo\n',
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'symbolic-ref --short refs/remotes/origin/HEAD': 'origin/main\n',
      'show-ref --verify --quiet refs/heads/main': ''
    })
    const facts = await resolveTaskGitFacts({ runGit })
    // source is main and only candidate is main -> no distinct target
    expect(facts.targetBranch).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-merge-git-facts.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/main/todos/todo-merge-git-facts.ts
import type { TaskGitFacts } from '../../shared/todo/todo-merge'

export type MergeGitExec = (argv: string[]) => Promise<{ stdout: string }>

async function tryStdout(runGit: MergeGitExec, argv: string[]): Promise<string | null> {
  try {
    const { stdout } = await runGit(argv)
    return stdout.trim() || null
  } catch {
    return null
  }
}

async function localBranchExists(runGit: MergeGitExec, name: string): Promise<boolean> {
  try {
    await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${name}`])
    return true
  } catch {
    return false
  }
}

// Reduce a ref candidate (e.g. "origin/main", "refs/remotes/origin/main",
// "refs/heads/main") to its bare branch name ("main").
function toBranchName(ref: string): string {
  const stripped = ref
    .replace(/^refs\/heads\//, '')
    .replace(/^refs\/remotes\/[^/]+\//, '')
  const slash = stripped.lastIndexOf('/')
  return slash >= 0 ? stripped.slice(slash + 1) : stripped
}

async function resolveTargetBranch(
  runGit: MergeGitExec,
  sourceBranch: string
): Promise<string | null> {
  const candidates: string[] = []
  const configured = await tryStdout(runGit, ['config', '--get', `branch.${sourceBranch}.base`])
  if (configured) candidates.push(configured)
  const originHead = await tryStdout(runGit, [
    'symbolic-ref',
    '--short',
    'refs/remotes/origin/HEAD'
  ])
  if (originHead) candidates.push(originHead)
  candidates.push('main', 'master')

  for (const candidate of candidates) {
    const name = toBranchName(candidate)
    if (!name || name === sourceBranch) continue
    if (await localBranchExists(runGit, name)) return name
  }
  return null
}

// Resolve the git facts a merge plan needs, from a runGit already bound to the task cwd.
export async function resolveTaskGitFacts(deps: {
  runGit: MergeGitExec
}): Promise<TaskGitFacts> {
  const repoRoot = await tryStdout(deps.runGit, ['rev-parse', '--show-toplevel'])
  if (!repoRoot) {
    return { repoRoot: null, sourceBranch: null, targetBranch: null }
  }
  const head = await tryStdout(deps.runGit, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const sourceBranch = head && head !== 'HEAD' ? head : null
  if (!sourceBranch) {
    return { repoRoot, sourceBranch: null, targetBranch: null }
  }
  const targetBranch = await resolveTargetBranch(deps.runGit, sourceBranch)
  return { repoRoot, sourceBranch, targetBranch }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-merge-git-facts.test.ts`
Expected: PASS（6 passed）

- [ ] **Step 5: Commit**

```bash
git add src/main/todos/todo-merge-git-facts.ts src/main/todos/todo-merge-git-facts.test.ts
git commit -m "feat(todo-p4a): resolve task git facts (repo/source/target)"
```

---

## Task 4: 合并执行 executeTaskMerge

**Files:**
- Create: `src/main/todos/todo-merge-executor.ts`
- Test: `src/main/todos/todo-merge-executor.test.ts`

说明：`runGit(argv) => Promise<{ stdout: string; stderr: string }>`，非零退出 **throw**（模拟 `gitExecFileAsync`）。流程：checkout target → `merge --ff-only source`（成功=fast-forward）→ 失败则 `merge --no-ff -m ... source`（成功=merge-commit）→ 成功后 `branch -d source`。任一 merge 抛错后用 `diff --name-only --diff-filter=U` 判定是否冲突：非空=conflict（`merge --abort` + `checkout source` 恢复）；空=error（尽力 abort + 恢复）。

- [ ] **Step 1: 写失败测试**

```ts
// src/main/todos/todo-merge-executor.test.ts
import { describe, it, expect } from 'vitest'
import { executeTaskMerge } from './todo-merge-executor'
import type { MergePlan } from '../../shared/todo/todo-merge'

const plan: MergePlan = {
  taskId: 't1',
  applicable: true,
  reason: 'ok',
  repoRoot: '/repo',
  sourceBranch: 'feature-x',
  targetBranch: 'main'
}

// Record calls; behavior configured per join(' ') key.
function makeRunGit(behavior: Record<string, () => { stdout?: string; stderr?: string } | never>) {
  const calls: string[] = []
  const runGit = async (argv: string[]): Promise<{ stdout: string; stderr: string }> => {
    const key = argv.join(' ')
    calls.push(key)
    const fn = behavior[key]
    if (!fn) return { stdout: '', stderr: '' }
    const r = fn()
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  return { runGit, calls }
}

describe('executeTaskMerge', () => {
  it('fast-forward path: checkout target, ff-only merge, delete source', async () => {
    const { runGit, calls } = makeRunGit({})
    const res = await executeTaskMerge({ runGit, plan })
    expect(res).toEqual({ outcome: 'merged', strategy: 'fast-forward', deletedBranch: 'feature-x' })
    expect(calls).toContain('checkout main')
    expect(calls).toContain('merge --ff-only feature-x')
    expect(calls).toContain('branch -d feature-x')
  })

  it('merge-commit path: ff-only fails (non-conflict), --no-ff succeeds', async () => {
    let ffTried = false
    const { runGit, calls } = makeRunGit({
      'merge --ff-only feature-x': () => {
        ffTried = true
        throw new Error('Not possible to fast-forward, aborting.')
      }
      // --no-ff merge + branch -d fall through to the default success stub
    })
    const res = await executeTaskMerge({ runGit, plan })
    expect(ffTried).toBe(true)
    expect(res).toEqual({ outcome: 'merged', strategy: 'merge-commit', deletedBranch: 'feature-x' })
    expect(calls).toContain(
      'merge --no-ff -m Merge feature-x into main (orca task t1) feature-x'
    )
    expect(calls).toContain('branch -d feature-x')
  })

  it('conflict path: merge fails with unmerged files -> abort + restore + conflict', async () => {
    const { runGit, calls } = makeRunGit({
      'merge --ff-only feature-x': () => {
        throw new Error('fast-forward not possible')
      },
      'diff --name-only --diff-filter=U': () => ({ stdout: 'src/a.ts\nsrc/b.ts\n' })
    })
    const res = await executeTaskMerge({ runGit, plan })
    expect(res).toEqual({ outcome: 'conflict', conflictFiles: ['src/a.ts', 'src/b.ts'] })
    expect(calls).toContain('merge --abort')
    expect(calls).toContain('checkout feature-x')
  })

  it('error path: checkout target fails, no unmerged files -> error', async () => {
    const { runGit } = makeRunGit({
      'checkout main': () => {
        throw new Error('cannot checkout: local changes')
      },
      'diff --name-only --diff-filter=U': () => ({ stdout: '' })
    })
    const res = await executeTaskMerge({ runGit, plan })
    expect(res.outcome).toBe('error')
    if (res.outcome === 'error') expect(res.message).toMatch(/checkout/i)
  })
})
```

> 注：默认 stub（`makeRunGit` 里未配置的 key）返回 `{ stdout: '', stderr: '' }` 且不抛错，
> 因此 fast-forward 用例的 `checkout main` / `branch -d feature-x`、merge-commit 用例的
> `merge --no-ff ...` 都会走默认成功路径，无需逐一配置。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-merge-executor.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写最小实现**

```ts
// src/main/todos/todo-merge-executor.ts
import type { MergeOutcome, MergePlan } from '../../shared/todo/todo-merge'

export type MergeRunGit = (argv: string[]) => Promise<{ stdout: string; stderr: string }>

async function unmergedFiles(runGit: MergeRunGit): Promise<string[]> {
  try {
    const { stdout } = await runGit(['diff', '--name-only', '--diff-filter=U'])
    return stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function safeRun(runGit: MergeRunGit, argv: string[]): Promise<void> {
  try {
    await runGit(argv)
  } catch {
    // best-effort recovery; ignore
  }
}

// Execute a local branch merge for a task. Requires an applicable, source≠target plan.
export async function executeTaskMerge(deps: {
  runGit: MergeRunGit
  plan: MergePlan
}): Promise<MergeOutcome> {
  const { runGit, plan } = deps
  const source = plan.sourceBranch as string
  const target = plan.targetBranch as string

  const rollback = async (): Promise<void> => {
    await safeRun(runGit, ['merge', '--abort'])
    await safeRun(runGit, ['checkout', source])
  }

  try {
    await runGit(['checkout', target])
  } catch (e) {
    await rollback()
    return { outcome: 'error', message: describeError(e) }
  }

  // Try fast-forward first.
  try {
    await runGit(['merge', '--ff-only', source])
    await safeRun(runGit, ['branch', '-d', source])
    return { outcome: 'merged', strategy: 'fast-forward', deletedBranch: source }
  } catch {
    // fall through to --no-ff
  }

  // ff not possible: attempt a real merge commit.
  try {
    await runGit(['merge', '--no-ff', '-m', `Merge ${source} into ${target} (orca task ${plan.taskId})`, source])
    await safeRun(runGit, ['branch', '-d', source])
    return { outcome: 'merged', strategy: 'merge-commit', deletedBranch: source }
  } catch (e) {
    const conflicts = await unmergedFiles(runGit)
    await rollback()
    if (conflicts.length > 0) {
      return { outcome: 'conflict', conflictFiles: conflicts }
    }
    return { outcome: 'error', message: describeError(e) }
  }
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/main/todos/todo-merge-executor.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5: Commit**

```bash
git add src/main/todos/todo-merge-executor.ts src/main/todos/todo-merge-executor.test.ts
git commit -m "feat(todo-p4a): add executeTaskMerge (ff->merge-commit, abort on conflict)"
```

---

## Task 5: IPC handler todo-merge.ts

**Files:**
- Create: `src/main/ipc/todo-merge.ts`

说明：仿 `todo-review.ts`——`ipcMain` 可注入、逻辑靠上层注入的 deps。deps 提供 `getTaskCwd(taskId)`（取最近 session 的 cwd）与 `runGitInCwd(cwd, argv)`（绑定 cwd 的 git 执行）。preview = facts→plan；execute = facts→plan→（applicable 才)executor。

- [ ] **Step 1: 写实现（无本地测试，靠 typecheck + 组合模块的既有测试）**

```ts
// src/main/ipc/todo-merge.ts
import { ipcMain as defaultIpcMain } from 'electron'
import type { MergeOutcome, MergePlan } from '../../shared/todo/todo-merge'
import { resolveTaskGitFacts } from '../todos/todo-merge-git-facts'
import { resolveTaskMergePlan } from '../todos/todo-merge-plan'
import { executeTaskMerge } from '../todos/todo-merge-executor'

export type TodoMergeHandlerDeps = {
  // Latest ACP session cwd for a task, or null when none.
  getTaskCwd: (taskId: string) => string | null
  // Run a git command bound to cwd; must throw on non-zero exit.
  runGitInCwd: (cwd: string, argv: string[]) => Promise<{ stdout: string; stderr: string }>
}

type IpcMainLike = {
  handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void
}

async function buildPlan(deps: TodoMergeHandlerDeps, taskId: string): Promise<MergePlan> {
  const cwd = deps.getTaskCwd(taskId)
  if (!cwd) {
    return {
      taskId,
      applicable: false,
      reason: 'no-session',
      repoRoot: null,
      sourceBranch: null,
      targetBranch: null
    }
  }
  const runGit = (argv: string[]): Promise<{ stdout: string; stderr: string }> =>
    deps.runGitInCwd(cwd, argv)
  const facts = await resolveTaskGitFacts({ runGit })
  return resolveTaskMergePlan(taskId, facts)
}

export function registerTodoMergeHandlers(
  deps: TodoMergeHandlerDeps,
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('todos:merge.preview', (_e, arg: { taskId: string }) => buildPlan(deps, arg.taskId))

  ipcMain.handle(
    'todos:merge.execute',
    async (_e, arg: { taskId: string }): Promise<MergeOutcome> => {
      const plan = await buildPlan(deps, arg.taskId)
      if (!plan.applicable) {
        return { outcome: 'error', message: `merge not applicable: ${plan.reason}` }
      }
      const cwd = deps.getTaskCwd(arg.taskId) as string
      const runGit = (argv: string[]): Promise<{ stdout: string; stderr: string }> =>
        deps.runGitInCwd(cwd, argv)
      return executeTaskMerge({ runGit, plan })
    }
  )
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/todo-merge.ts
git commit -m "feat(todo-p4a): add todos:merge preview/execute IPC handlers"
```

---

## Task 6: 主进程接线 register-core-handlers

**Files:**
- Modify: `src/main/ipc/register-core-handlers.ts`（import 区 + `registerTodoReviewHandlers({...})` 调用之后）

说明：`getTaskCwd` 复用 `acpKernel.sessionManager.listSessions(taskId)[0]?.cwd ?? null`；`runGitInCwd` 用 `gitExecFileAsync(argv, { cwd })`。

- [ ] **Step 1: 加 import（在第 63 行 `scanReviewPortsForTask` import 附近）**

```ts
import { registerTodoMergeHandlers } from './todo-merge'
import { gitExecFileAsync } from '../git/runner'
```
> 若 `gitExecFileAsync` 已在本文件 import,则只加 `registerTodoMergeHandlers` 一行。先 grep 确认：
> Run: `grep -n "gitExecFileAsync" src/main/ipc/register-core-handlers.ts`

- [ ] **Step 2: 在 `registerTodoReviewHandlers({ ... })` 调用之后加**

```ts
  registerTodoMergeHandlers({
    getTaskCwd: (taskId) => {
      const sessions = acpKernel.sessionManager.listSessions(taskId) as AcpSessionRecord[]
      return sessions[0]?.cwd ?? null
    },
    runGitInCwd: (cwd, argv) => gitExecFileAsync(argv, { cwd })
  })
```

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/register-core-handlers.ts
git commit -m "feat(todo-p4a): wire todos:merge handlers with cwd git exec"
```

---

## Task 7: preload 绑定

**Files:**
- Modify: `src/preload/api-types.ts:3106`（`review:` 块旁）
- Modify: `src/preload/index.ts:4234`（`review:` 块旁）

- [ ] **Step 1: api-types.ts — 在 `review: { scanPorts: ... }` 之后加 `merge` 块**

在 `src/preload/api-types.ts` 顶部类型 import 处加：
```ts
import type { MergeOutcome, MergePlan } from '../shared/todo/todo-merge'
```
在 `todos` 的 `review: { scanPorts: ... }` 同级后面加：
```ts
    merge: {
      preview: (input: { taskId: string }) => Promise<MergePlan>
      execute: (input: { taskId: string }) => Promise<MergeOutcome>
    }
```

- [ ] **Step 2: index.ts — 同位置加实现绑定**

在 `src/preload/index.ts` 顶部 import 处加：
```ts
import type { MergeOutcome, MergePlan } from '../shared/todo/todo-merge'
```
在 `todos` 的 `review: { scanPorts: (input) => ... }` 同级后面加：
```ts
    merge: {
      preview: (input: { taskId: string }): Promise<MergePlan> =>
        ipcRenderer.invoke('todos:merge.preview', input),
      execute: (input: { taskId: string }): Promise<MergeOutcome> =>
        ipcRenderer.invoke('todos:merge.execute', input)
    },
```
> 注意逗号：确保新块与相邻 `review` 块之间语法正确（对象成员以逗号分隔）。

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/preload/api-types.ts src/preload/index.ts
git commit -m "feat(todo-p4a): expose window.api.todos.merge preview/execute"
```

---

## Task 8: 渲染层 MergingPanel

**Files:**
- Create: `src/renderer/src/components/todo/detail/MergingPanel.tsx`
- Test: `src/renderer/src/components/todo/detail/MergingPanel.test.tsx`

说明：参考 `ReviewBrowserPane.tsx`（`window.api.todos.*` 调用 + 状态机 + `translate`）与 `ReviewDecisionBar.tsx`（`updateTodoItem` 用法）。测试用 happy-dom；`window.api` 需 mock。`translate` 返回英文 fallback，故断言用 fallback 文案。

- [ ] **Step 1: 写失败测试**

```tsx
// src/renderer/src/components/todo/detail/MergingPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MergingPanel } from './MergingPanel'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { MergeOutcome, MergePlan } from '../../../../../shared/todo/todo-merge'

const item = { id: 't1', status: 'merging' } as TodoItem

const updateTodoItem = vi.fn()
vi.mock('@/store', () => ({
  useAppStore: (sel: (s: unknown) => unknown) => sel({ updateTodoItem })
}))

function setApi(preview: MergePlan, execute?: MergeOutcome): void {
  ;(globalThis as unknown as { window: { api: unknown } }).window = {
    api: {
      todos: {
        merge: {
          preview: vi.fn(async () => preview),
          execute: vi.fn(async () => execute)
        }
      }
    }
  } as never
}

const okPlan: MergePlan = {
  taskId: 't1',
  applicable: true,
  reason: 'ok',
  repoRoot: '/repo',
  sourceBranch: 'feature-x',
  targetBranch: 'main'
}

beforeEach(() => {
  updateTodoItem.mockReset()
})

describe('MergingPanel', () => {
  it('shows source -> target after preview', async () => {
    setApi(okPlan)
    render(<MergingPanel item={item} />)
    await waitFor(() => expect(screen.getByText(/feature-x/)).toBeTruthy())
    expect(screen.getByText(/main/)).toBeTruthy()
  })

  it('merge success -> sets status done', async () => {
    setApi(okPlan, { outcome: 'merged', strategy: 'fast-forward', deletedBranch: 'feature-x' })
    render(<MergingPanel item={item} />)
    await waitFor(() => screen.getByRole('button', { name: /merge/i }))
    fireEvent.click(screen.getByRole('button', { name: /merge/i }))
    await waitFor(() => expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'done' }))
  })

  it('conflict -> sets status rework and lists files', async () => {
    setApi(okPlan, { outcome: 'conflict', conflictFiles: ['src/a.ts'] })
    render(<MergingPanel item={item} />)
    await waitFor(() => screen.getByRole('button', { name: /merge/i }))
    fireEvent.click(screen.getByRole('button', { name: /merge/i }))
    await waitFor(() => expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'rework' }))
    expect(screen.getByText(/src\/a\.ts/)).toBeTruthy()
  })

  it('already-on-base -> shows mark done button', async () => {
    setApi({ ...okPlan, applicable: false, reason: 'already-on-base', sourceBranch: 'main' })
    render(<MergingPanel item={item} />)
    await waitFor(() => screen.getByRole('button', { name: /done|complete|mark/i }))
    fireEvent.click(screen.getByRole('button', { name: /done|complete|mark/i }))
    await waitFor(() => expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'done' }))
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/MergingPanel.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```tsx
// src/renderer/src/components/todo/detail/MergingPanel.tsx
import React from 'react'
import { GitMerge, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { MergeOutcome, MergePlan } from '../../../../../shared/todo/todo-merge'

type MergingPanelProps = { item: TodoItem }

type PanelState =
  | { phase: 'loading' }
  | { phase: 'ready'; plan: MergePlan }
  | { phase: 'merging'; plan: MergePlan }
  | { phase: 'conflict'; files: string[] }
  | { phase: 'error'; plan: MergePlan; message: string }

export function MergingPanel({ item }: MergingPanelProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const [state, setState] = React.useState<PanelState>({ phase: 'loading' })

  React.useEffect(() => {
    let cancelled = false
    void window.api.todos.merge.preview({ taskId: item.id }).then((plan) => {
      if (!cancelled) setState({ phase: 'ready', plan })
    })
    return () => {
      cancelled = true
    }
  }, [item.id])

  const runMerge = async (plan: MergePlan): Promise<void> => {
    setState({ phase: 'merging', plan })
    const res: MergeOutcome = await window.api.todos.merge.execute({ taskId: item.id })
    if (res.outcome === 'merged') {
      void updateTodoItem(item.id, { status: 'done' })
    } else if (res.outcome === 'conflict') {
      void updateTodoItem(item.id, { status: 'rework' })
      setState({ phase: 'conflict', files: res.conflictFiles })
    } else {
      setState({ phase: 'error', plan, message: res.message })
    }
  }

  if (state.phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {translate('auto.components.todo.detail.MergingPanel.detecting', 'Detecting merge target…')}
      </div>
    )
  }

  if (state.phase === 'conflict') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-2">
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="size-4" />
          {translate('auto.components.todo.detail.MergingPanel.conflictTitle', 'Merge conflict — moved to Rework')}
        </div>
        <ul className="min-h-0 flex-1 overflow-auto rounded border border-border p-2 text-sm">
          {state.files.map((f) => (
            <li key={f} className="truncate font-mono">
              {f}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const plan = state.plan

  if (!plan.applicable) {
    const reasonText =
      plan.reason === 'already-on-base'
        ? translate('auto.components.todo.detail.MergingPanel.alreadyOnBase', 'Already on the base branch — no merge needed.')
        : translate('auto.components.todo.detail.MergingPanel.notApplicable', 'Cannot auto-merge for this task.')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{reasonText}</p>
        <Button size="sm" onClick={() => void updateTodoItem(item.id, { status: 'done' })}>
          {translate('auto.components.todo.detail.MergingPanel.markDone', 'Mark done')}
        </Button>
      </div>
    )
  }

  const busy = state.phase === 'merging'
  return (
    <div className="flex h-full flex-col gap-4 p-2">
      <div className="rounded border border-border p-3 text-sm">
        <div className="mb-1 text-muted-foreground">
          {translate('auto.components.todo.detail.MergingPanel.repo', 'Repository')}: {plan.repoRoot}
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span>{plan.sourceBranch}</span>
          <span aria-hidden>→</span>
          <span>{plan.targetBranch}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {translate('auto.components.todo.detail.MergingPanel.strategy', 'Fast-forward if possible, otherwise a merge commit.')}
        </div>
      </div>
      {state.phase === 'error' ? (
        <p className="text-sm text-destructive">{state.message}</p>
      ) : null}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void runMerge(plan)}>
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <GitMerge className="mr-1 size-4" />}
          {translate('auto.components.todo.detail.MergingPanel.merge', 'Merge')}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/MergingPanel.test.tsx`
Expected: PASS（4 passed）

- [ ] **Step 5: 同步本地化目录**

Run: `pnpm run sync:localization-catalog`
Expected: 为 5 个 locale 各补 8 个 `auto.components.todo.detail.MergingPanel.*` key（detecting / conflictTitle / alreadyOnBase / notApplicable / markDone / repo / strategy / merge）。确认无报错。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/todo/detail/MergingPanel.tsx src/renderer/src/components/todo/detail/MergingPanel.test.tsx src/renderer/src/i18n
git commit -m "feat(todo-p4a): add MergingPanel (preview/confirm merge, conflict->rework)"
```

---

## Task 9: 接入 TodoDetailView

**Files:**
- Modify: `src/renderer/src/components/todo/detail/TodoDetailView.tsx`（import + `merging` 分支)
- Modify: `src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`（新增断言）

- [ ] **Step 1: 写失败测试（在 TodoDetailView.test.tsx 加）**

该测试文件用「stub 子面板 + 断言 stub 文案」的模式（`InProgressPanel`/`HumanReviewPanel` 都被 `vi.mock` 成简单 div）。沿用同一模式：在顶部 `vi.mock('./HumanReviewPanel', ...)` 之后加 `MergingPanel` 的 mock，再加一条 `merging` 用例。

在第 27 行 `vi.mock('./HumanReviewPanel', ...)` 之后加：
```tsx
vi.mock('./MergingPanel', () => ({
  MergingPanel: () => <div>merging-panel</div>
}))
```
在 `describe('TodoDetailView', ...)` 内、`human_review` 用例之后加：
```tsx
  it('renders the MergingPanel for merging', () => {
    items = [mkItem({ status: 'merging' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('merging-panel')).toBeInTheDocument()
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`
Expected: FAIL（当前 `merging` 走 `TodoDetailOverview`，渲染 `mkItem` 的 title "Do it" 而非 "merging-panel"）

- [ ] **Step 3: 实现——加 import 与分支**

在 import 区（`HumanReviewPanel` import 后）加：
```ts
import { MergingPanel } from './MergingPanel'
```
把 `TodoDetailView.tsx:58-60` 的分支改为在 `human_review` 之后、`) : (` 之前插入：
```tsx
        ) : item.status === 'merging' ? (
          <MergingPanel item={item} />
```
即最终为：
```tsx
        {item.status === 'in_progress' ? (
          <InProgressPanel item={item} />
        ) : item.status === 'human_review' ? (
          <HumanReviewPanel item={item} />
        ) : item.status === 'merging' ? (
          <MergingPanel item={item} />
        ) : (
          <TodoDetailOverview item={item} />
        )}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/todo/detail/TodoDetailView.tsx src/renderer/src/components/todo/detail/TodoDetailView.test.tsx
git commit -m "feat(todo-p4a): render MergingPanel in merging status"
```

---

## Task 10: 全量验证门

**Files:** 无（仅运行验证命令，修任何暴露的问题）

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: PASS（无 TS 错误）

- [ ] **Step 2: lint（含 max-lines-ratchet + 本地化覆盖/目录）**

Run: `pnpm lint`
Expected: PASS。若 `verify-localization-coverage` 报 MergingPanel 有未本地化的可见字符串/aria，按提示用 `translate(...)` 包裹后 `pnpm run sync:localization-catalog` 再跑。若 `check:max-lines-ratchet` 报 MergingPanel 超限，拆分（如把冲突视图/就绪视图抽成小组件文件），**不得** disable。

- [ ] **Step 3: 跑 P4a 全部测试**

Run:
```bash
npx vitest run --config config/vitest.config.ts \
  src/main/todos/todo-merge-plan.test.ts \
  src/main/todos/todo-merge-git-facts.test.ts \
  src/main/todos/todo-merge-executor.test.ts \
  src/renderer/src/components/todo/detail/MergingPanel.test.tsx \
  src/renderer/src/components/todo/detail/TodoDetailView.test.tsx
```
Expected: 全部 PASS。

- [ ] **Step 4: 若有本地化文件改动，补 commit**

```bash
git add -A
git commit -m "chore(todo-p4a): sync localization catalog for MergingPanel" || echo "nothing to commit"
```

---

## 已知限制 / 后续（写入收尾说明，勿当作缺陷）

- **SSH 远程 cwd 未走 relay**：本子项目 git 经 `gitExecFileAsync(argv, { cwd })`,自带 WSL 路径翻译,但 cwd-only 任务未接 relay/SSH 远端 git 路由（与整个 todo/ACP 特性现状一致——任务本就 cwd-only、不接 worktree/relay 图）。远端 host 上的任务合并留待后续。
- **未提交改动**：假定 agent 工作已提交。cwd 有未提交改动导致 checkout/merge 失败时按 `error` 呈现,不自动 stash/commit。
- **IPC handler 无本地测试**:`todo-merge.ts` 仅 import electron `ipcMain` + 组合已测模块;逻辑覆盖在 plan/git-facts/executor 三个模块的单测里。如需 handler 级测试,可仿 P3 注入 `ipcMain` 后在 CI 跑。
- **P4b（Done 数据看板）** 独立进行；其 Skill/SubAgent/MCP 埋点 v1 明确不做。

## 复用清单
| 复用点 | 来源 |
|---|---|
| git 执行（含 WSL 翻译） | `gitExecFileAsync` (`src/main/git/runner.ts:798`) |
| 基准分支候选思路 | `getBranchCleanupTargetRefs` (`src/shared/git-branch-cleanup.ts:44`) 的 config/origin-HEAD 顺序 |
| task→cwd | `acpKernel.sessionManager.listSessions(taskId)[0].cwd`,对齐 `review-port-scan.ts` |
| IPC 注册 / preload 绑定 | `todo-review.ts` + `register-core-handlers.ts:208` + `preload/*:review` 块 |
| 详情面板接法 | `HumanReviewPanel` + `TodoDetailView.tsx:56-62` |
| 状态置位 | `useAppStore().updateTodoItem`（`ReviewDecisionBar.tsx`） |
| UI 基元 / tokens / 图标 | `@/components/ui/button`、STYLEGUIDE、`GitMerge`/`Loader2`/`AlertTriangle` |
