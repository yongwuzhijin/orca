# TODO Board P4a — merging 态接真实 git 合并 (Design)

- **Date**: 2026-07-13
- **Phase**: P4a (P4 拆分后的第一子项目;P4b = Done 数据看板,独立 spec 后续再做)
- **Depends on**: P2(ACP 执行内核 + session 记录)、P3(Human Review 决策条已把"通过"置为 `merging`)
- **Status**: Design — 待 writing-plans

## 0. 背景与问题

P3 的 `ReviewDecisionBar` 在人工评审"通过"时只是把任务状态置为 `merging`(`src/renderer/src/components/todo/detail/ReviewDecisionBar.tsx:25`),`merging` 目前是**纯状态标签**(`todo-status-catalog.tsx` 里带 `GitMerge` 图标),背后没有任何真实 git 行为,也没有 `merging → done` 的流转。

P4a 的目标:进入 `merging` 后执行**真实的本地 git 合并**——把任务工作所在分支合并回其基准分支,成功后置 `done`,冲突/失败则回退 `rework`。

### 关键现实约束(探查得出,影响设计前提)

1. **任务不跑在 orca 管理的 worktree 里**。ACP 直接在用户于 `EnterInProgressDialog` 选定的 `cwd`(默认 `project.defaultWorkingDir`)中执行;`src/main/acp/review-port-scan.ts:13` 注释明确:"Tasks run ACP in a cwd only (no worktreeId)"。
2. **orca 不为任务创建分支**。agent 在 `cwd` 当前 checkout 的分支上工作。因此"源分支"只能是探测到的当前分支,而非 orca 托管的分支。
3. **没有 worktree 可清理**;`worktree.ts removeWorktree` 不适用于本子项目。合并成功后要删除的是普通已合并分支。
4. **本地 git 合并不存在**。全仓仅有托管平台 PR/MR 合并(`mergeRepoPR`),没有 `git merge <branch>` 的本地调用。核心执行逻辑为新建。

## 1. 决策汇总(brainstorming 已确认)

| 维度 | 决策 |
|---|---|
| 合并机制 | **本地合并**:源 = cwd 当前分支,目标 = 其基准分支 |
| 合并策略 | **ff 优先**,不能 fast-forward 则 `--no-ff` merge commit |
| 触发方式 | **看板内确认后才合并**:进入 `merging` 显示 `MergingPanel`,自动探测并预览,用户点"合并"才真正执行 |
| 冲突/失败 | `git merge --abort` 回滚 + 恢复原分支 → 任务回退 `rework` + 看板展示冲突文件清单 |
| 成功后清理 | 删除已合并的**普通任务分支**(无 worktree 可清)→ 置 `done` |
| 源==目标(已在基准分支) | 不适用合并 → 提示"无需合并" + 允许直接置 `done` |
| host 路由 | 走 source control 同款 **host 感知 git 层**(本地/WSL/SSH/relay),不用裸 `main/git/runner` |

## 2. 数据链路

```
task (todoItems[i])
  → todo_items.session_id                 (P2 已存,指向最近一次 ACP 执行)
  → acp_sessions (getBySessionId / listByTask)
  → acp_sessions.cwd                       (agent 实际运行目录)
  → 由 cwd 解析:
      repoRoot     = git rev-parse --show-toplevel
      sourceBranch = git rev-parse --abbrev-ref HEAD
      targetBranch = branch.<source>.base(git config)→ 回退 origin/HEAD → 回退 main/master
```

- 一 task 可能有多次 session(rework 重来):取 `listByTask` 最新一条的 `cwd`(与 P3 `scanReviewPortsForTask` 的 cwd 取法一致,保持一致性)。
- 若 task 无 `session_id` / 无 acp_sessions 记录 / cwd 不在 git 仓库 → `applicable:false`,给出对应 reason。

## 3. 架构与模块

### 3.1 主进程(新建)

**`src/main/todos/todo-merge-plan.ts`** — 纯函数,零 I/O,便于单测
```ts
export type MergePlanReason =
  | 'ok'
  | 'no-session'          // task 无关联 ACP session
  | 'not-a-repo'          // cwd 不在 git 仓库
  | 'detached-head'       // 源为游离 HEAD,无分支名
  | 'already-on-base'     // 源 == 目标,无需合并
  | 'no-base'             // 找不到基准分支

export type MergePlan = {
  taskId: string
  applicable: boolean          // 是否需要/能够合并
  reason: MergePlanReason
  repoRoot: string | null
  sourceBranch: string | null
  targetBranch: string | null
}

// 输入已解析好的 git 事实(便于纯测试),输出计划
export function resolveTaskMergePlan(input: {
  taskId: string
  repoRoot: string | null
  sourceBranch: string | null   // null = detached / not-a-repo
  targetBranch: string | null
}): MergePlan
```

**`src/main/todos/todo-merge-executor.ts`** — 执行合并(接收 host 感知的 `runGit` 注入,便于 mock)
```ts
export type MergeOutcome =
  | { outcome: 'merged'; strategy: 'fast-forward' | 'merge-commit'; deletedBranch: string | null }
  | { outcome: 'conflict'; conflictFiles: string[] }
  | { outcome: 'error'; message: string }

export async function executeTaskMerge(input: {
  runGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>
  plan: MergePlan            // 必须 applicable:true 且 source≠target
}): Promise<MergeOutcome>
```
执行流程(在 repoRoot 上):
1. 记录 `originalBranch = sourceBranch`(用于失败恢复)。
2. `checkout <targetBranch>`。
3. 尝试 `merge --ff-only <source>`;失败(非冲突原因,如需要 merge commit)→ `merge --no-ff <source> -m "Merge <source> into <target> (orca task <id>)"`。
4. **成功** → `branch -d <source>`(删除已合并分支;`-d` 而非 `-D`,保证只删已合并)→ 返回 `merged`。
5. **冲突**(merge 退出非零且工作树有冲突)→ `merge --abort` → `checkout <originalBranch>` 恢复 → 返回 `conflict` + `diff --name-only --diff-filter=U` 收集的文件清单。
6. **其他错误** → 尽力 `merge --abort` + 恢复原分支 → 返回 `error` + stderr 摘要。

> 副作用说明:合并会让 cwd 停在 target 分支。任务正处于收尾阶段,此副作用可接受;失败路径显式恢复到原分支,避免把用户工作目录留在半途状态。

**`src/main/ipc/todo-merge.ts`** — IPC handlers
- `todos:merge.preview` `({ taskId }) → MergePlan`:解析 cwd + git 事实 → `resolveTaskMergePlan`。
- `todos:merge.execute` `({ taskId }) → MergeOutcome`:重新取 plan(防陈旧)→ 校验 applicable → `executeTaskMerge`。
- 在 `src/main/ipc/register-core-handlers.ts` 挂载 `registerTodoMergeHandlers(...)`(仿 P3 `registerTodoReviewHandlers` 接法)。

**host 感知 git**:preview/execute 内解析 cwd 与执行 git 时,复用 source control 走的运行时 git 层(`orca-runtime-git` / relay `git-handler`),使 WSL/SSH/relay 场景下 git 在正确 host 执行。基准分支解析可复用 `src/shared/git-branch-cleanup.ts` 的 `getBranchCleanupTargetRefs`。

### 3.2 preload / api-types
- `src/preload/index.ts` + `src/preload/api-types.ts`:新增 `window.api.todos.merge.preview(input)` / `.execute(input)`,类型引用共享的 `MergePlan` / `MergeOutcome`(放 `src/shared/todo/` 下,渲染层/主进程共用)。

### 3.3 渲染层(新建)

**`src/renderer/src/components/todo/detail/MergingPanel.tsx`**
- 挂载:`window.api.todos.merge.preview({ taskId: item.id })` → 存 plan。
- 渲染分支:
  - **loading**:探测中占位。
  - **applicable:true**:展示卡片(仓库根 / `源 → 目标` / 策略 "ff 优先,否则 merge commit"),一个主按钮"合并"。
    - 点击 → `execute` → 执行中禁用 + 进度提示 →
      - `merged` → `updateTodoItem(item.id, { status: 'done' })`(可附成功 toast:策略 + 已删分支)。
      - `conflict` → `updateTodoItem(item.id, { status: 'rework' })` + 列出 `conflictFiles`(提示回到 rework 重新处理)。
      - `error` → 显示 `message` + "重试"按钮。
  - **applicable:false**:按 reason 显示说明(如 `already-on-base` → "当前已在基准分支,无需合并"),提供"标记完成"按钮 → `updateTodoItem(done)`;不可自动合并的 reason(no-session / not-a-repo / no-base / detached-head)展示对应文案,同样允许手动置 done 或返回。
- 复用:`@/components/ui/button` Button、STYLEGUIDE tokens(不新造颜色/字号)、`GitMerge` 图标、`translate('auto.components.todo.detail.MergingPanel.<key>', '<fallback>')` 本地化。

**`src/renderer/src/components/todo/detail/TodoDetailView.tsx`**
- 在现有 `human_review` 分支后加 `merging` 分支:
  ```tsx
  ) : item.status === 'merging' ? (
    <MergingPanel item={item} />
  ) : (
  ```

## 4. 状态流转

```
human_review --(P3 Approve)--> merging
merging --(合并成功 / 无需合并)--> done
merging --(冲突或失败)--> rework
```

## 5. 测试策略(TDD,与 P3 一致)

**纯函数(vitest,本地可跑)**
- `todo-merge-plan.test.ts`:`resolveTaskMergePlan` 覆盖 ok / already-on-base / detached-head / not-a-repo / no-base / no-session。
- `todo-merge-executor.test.ts`:注入 mock `runGit`,覆盖 ff 成功、非 ff→merge commit 成功、冲突→abort+恢复+文件清单、error→abort+恢复。

**渲染层(happy-dom vitest,本地可跑)**
- `MergingPanel.test.tsx`:preview loading;applicable→点合并→merged→置 done;→conflict→置 rework+显示文件;→error→重试;applicable:false(already-on-base)→标记完成→done。
- `TodoDetailView.test.tsx`:`merging` 状态渲染 `MergingPanel`。

**IPC(electron 依赖,仅 CI 跑)**
- `todo-merge.test.ts`:preview/execute handler 行为。本地无法装 Electron 二进制(网络受限),同 P3 只在 CI 验证;本地以 `pnpm typecheck` 兜底。

## 6. 验证门(声称完成前必须全绿)
1. `pnpm typecheck`
2. `pnpm lint`(reliability-gates + `check:max-lines-ratchet` + `verify-localization-catalog` + `verify-localization-coverage`,均不得 disable)
3. `npx vitest run --config config/vitest.config.ts <P4a 新增测试路径>`
4. i18n:新增 key 用 `translate(...)` 后跑 `pnpm run sync:localization-catalog`;删除文案需手动清理孤儿 key(sync 不 prune)。

## 7. 跨平台 / 兼容性
- git 命令(`rev-parse`、`merge --ff-only/--no-ff/--abort`、`branch -d`、`diff --name-only --diff-filter=U`、`config branch.<n>.base`)均远早于 Git 2.25 baseline,无兼容分支需求。
- 所有 git 执行经 host 感知运行时层,满足 SSH / WSL / relay 用例(AGENTS.md)。
- 文件路径经 Node/Electron path 工具处理,不假设分隔符。

## 8. 明确不做(YAGNI / 留给后续)
- **不**新建任务分支/worktree 管理(维持 P2 现状:任务在用户选定 cwd 执行)。
- **不**做托管 PR/MR 合并路径(本子项目只做本地合并)。
- **不**处理合并前自动 commit 未提交改动(假定 agent 工作已提交;未提交改动导致的 checkout/merge 失败按 error 呈现)。
- **不**做 Done 数据看板(P4b)。

## 9. 复用清单
| 复用点 | 来源 |
|---|---|
| 基准分支解析 | `src/shared/git-branch-cleanup.ts` `getBranchCleanupTargetRefs` |
| host 感知 git 执行 | source control 运行时 git 层(`orca-runtime-git` / relay `git-handler`) |
| task→cwd 取法 | 对齐 P3 `src/main/acp/review-port-scan.ts` 的 listByTask + cwd |
| 详情面板接法 | 复刻 P3 `HumanReviewPanel` 在 `TodoDetailView` 的挂载模式 |
| 状态置位 | 渲染层 `useAppStore().updateTodoItem` |
| UI 基元 / tokens | `@/components/ui/button`、STYLEGUIDE、`GitMerge` 图标、`translate()` |
