# 需求模块增强：工作区、PRD 解析、需求澄清

- 日期: 2026-09-02
- 状态: 待用户审阅
- 前置: Todo Board P1–P4、开始任务自动建 worktree（2026-08-28 spec）
- 参考: dmon-work-electron `dingTalkDocParsePrompt.ts`、`markdownImage.tsx`、`requirementDocStorage.ts`

---

## 0. 背景与已定决策

用户希望在 Orca 需求模块中补齐 PRD 全生命周期能力：创建时建工作区与文档目录、PRD 解析与图片本地化、需求澄清、PRD 查看/编辑/AI 补充，以及设置页模板管理。

**已定决策（用户确认）:**

1. **创建需求时**立即创建 git worktree，并在其中创建 `.dmonwork_worktree/` 临时文档目录。
2. **开始任务时**复用已有 `boundWorktreeId`，不再重复 `createWorktree`。
3. 设置 → Workflows 组新增 **「需求设置」** 入口，内含「开始任务模板管理」与「需求澄清模板管理」（分表存储）。
4. PRD 解析通过 **智能体 + MCP Server**（钉钉文档 MCP）；未配置 MCP 时阻断并提示安装链接。
5. 待办阶段详情页 header 在 identifier 后展示 **需求标题**（如 `TODO-2 · 测试需求链路`）。

---

## 1. 范围

### 1.1 目标（P0）

| # | 能力 | 说明 |
|---|------|------|
| 1 | Header 展示标题 | `TodoDetailView` header：`{identifier} · {title}`；看板卡片可选同行展示 |
| 2 | 创建时建区 | 绑定项目后创建 worktree + `.dmonwork_worktree/`；写 `boundWorktreeId` |
| 3 | PRD 解析 | 有 `prdLink` 时：写 stub `prd.md`（含链接）→ ACP 会话按 prompt 调 MCP 解析并本地化图片 |
| 4 | 待办详情 UI | 替换纯 description 预览：PRD 查看/编辑、文件树（`.dmonwork_worktree`）、需求澄清、PRD 补充 |
| 5 | 需求澄清 | 选澄清模板 → ACP 产出不明确点列表 → 用户标注无效/回复 → 再生成完整 PRD |
| 6 | 需求设置 | Settings 新 section：两套模板 CRUD（复用 `TodoTemplateManagerDialog` 交互） |

### 1.2 非目标（本版不做）

- 多项目同时建多个 worktree
- 非钉钉 PRD 源（Confluence、Notion 等）的专用解析器
- 澄清/解析过程的离线队列与断点续传
- `.dmonwork_worktree` 外其他产物目录（api/、specs/）的自动生成——仅预留目录结构
- 把「工作流管理」从 dmon-work 迁入 Orca

---

## 2. 目录结构

在 **bound worktree 根目录**下：

```
{worktreePath}/
  .dmonwork_worktree/
    prd.md                 # 主 PRD（解析/澄清/补充的目标文件）
    prd-link.txt           # 原始 prdLink 备份（可选，便于重解析）
    assets/                # 本地化图片
    clarification.json     # 澄清条目持久化（见 §5）
    specs/                 # 预留：系分
    plans/                 # 预留：Plan
    api/                   # 预留：接口文档
    _meta.json             # todoId、createdAt、parseStatus 等
```

**与 dmon-work-electron 差异:** 使用固定子目录名 `.dmonwork_worktree`（非 `.dmonwork/requirement/{stamp}-req-{id}/`），与 git worktree 同生命周期。

---

## 3. 创建需求：工作区 + PRD 解析

### 3.1 创建流程

```
TodoCreateDialog.submit
  → todos:items:create (SQLite)
  → 若 workspaceProjectIds 非空:
       resolveTodoStartRepo → createWorktree
       → mkdir .dmonwork_worktree/{assets,specs,plans,api}
       → 写 _meta.json
       → updateTodoItem({ boundWorktreeId })
       → activateAndRevealWorktree (可选，toast 提示)
  → 若 prdLink 非空:
       写 prd.md stub: "# {title}\n\nPRD: {prdLink}\n"
       写 prd-link.txt
       → 检查 repo MCP 是否含 ding_doc_read（或配置的 PRD MCP id）
       → 有: 启动 PRD 解析 ACP 会话（见 §3.3）
       → 无: toast + 详情页 banner「未配置钉钉文档 MCP，无法自动解析 PRD」
```

**约束:**

- **新建需求必须绑定 Orca 项目**（与创建表单的产品语义一致，非可选假设）。提交时若 `workspaceProjectIds` 为空则禁用创建并提示；创建成功后 **同步** 建 worktree + `.dmonwork_worktree`（不再区分「有 PRD 才需要项目」）。
- Folder 项目：与现有 start 逻辑一致，toast 不支持自动建 worktree。
- 创建失败：保留 todo item，但不写 `boundWorktreeId`；详情页展示重试「创建工作区」。

### 3.2 开始任务变更

`EnterInProgressDialog.confirm`:

- 若 `item.boundWorktreeId` 已存在 → **跳过** `createWorktree`，直接 `activateAndRevealWorktree` + 启动 ACP/终端。
- 若不存在（历史数据 / 创建失败）→ 沿用现有 `startTodoWorkspace()` 兜底。

### 3.3 PRD 解析 Prompt

移植 `buildDingTalkDocParsePrompt`，路径改为 `.dmonwork_worktree/prd.md` 与 `assets/`。

Orca 侧工具映射（相对 dmon-work 的 `skills_*`）:

| dmon-work | Orca |
|-----------|------|
| MCP 读钉钉文档 | repo/global MCP `ding_doc_read` |
| `skills_download_file` | main IPC 文件下载 或 agent Write/Shell curl |
| `skills_write_text_file` | agent 文件工具 / IPC write |

**MCP 检测:** 读取当前 repo 的 MCP 配置（`McpConfigSection` 同源），检查是否注册钉钉文档 server；无则 UI 阻断。

**图片本地化:** 移植 `src/lib/markdownImage.ts`（从 dmon-work-electron）到 Orca renderer + shared；Markdown 预览用 `createMarkdownImageRenderer` + 现有 `LocalImage` 或等价组件。

### 3.4 解析状态

`_meta.json` 字段:

```json
{
  "todoId": "…",
  "prdLink": "https://…",
  "parseStatus": "pending|running|done|failed|skipped",
  "parseSessionId": "…",
  "parseError": null,
  "updatedAt": "ISO8601"
}
```

详情页展示解析进度；失败可「重新解析」。

---

## 4. 待办阶段详情 UI

### 4.1 Header

```tsx
// TodoDetailView header
<span>{item.identifier}</span>
<span className="truncate">{item.title}</span>
```

样式：`TODO-2 · 测试需求链路`（identifier muted，title foreground）。

### 4.2 主内容区（status === 'todo'）

新组件 `TodoRequirementPanel`（取代 `TodoDetailOverview`）:

| Tab | 内容 |
|-----|------|
| **需求** | 现有 description Markdown 预览 + 元信息 |
| **PRD** | `prd.md` 编辑器（复用 `ReviewFilePreviewDialog` / `EditorPanel` 模式）；无文件时空状态 + 手动创建 |
| **澄清** | 澄清列表 UI + 「开始澄清」按钮（模板选择 dialog） |
| **补充** | 嵌入式 ACP 对话，system prompt 指向 `.dmonwork_worktree/prd.md` 修改 |

**文件树:** PRD tab 侧边可嵌 `FileExplorer`，根路径 scoped 到 `.dmonwork_worktree`（复用 human review 的 `ReviewFilePane` 模式，新建 `RequirementWorktreeFilePane`）。

### 4.3 Worktree 上下文

新增 hook `useRequirementWorktreeId(item)`:

- 优先 `item.boundWorktreeId`
- 提供 `requirementDocRoot = join(worktreePath, '.dmonwork_worktree')`

---

## 5. 需求澄清

### 5.1 数据模型

**模板表** `todo_clarification_templates`（SQLite，结构同 `todo_templates`）:

```ts
type TodoClarificationTemplate = { id, name, body, createdAt, updatedAt }
```

**条目文件** `.dmonwork_worktree/clarification.json`:

```ts
type ClarificationItem = {
  id: string
  question: string
  context?: string
  status: 'open' | 'invalid' | 'answered'
  answer?: string
  createdAt: string
  updatedAt: string
}
type ClarificationState = {
  sessionId?: string
  templateId?: string
  items: ClarificationItem[]
  revisedAt?: string
}
```

### 5.2 流程

```
用户点击「开始澄清」
  → ClarificationTemplatePicker（同 TodoTemplatePicker）
  → 构建 prompt: template.body + 读取 prd.md 路径
  → ACP executeTask
  → Agent 输出结构化 JSON（或约定 markdown 列表）→ main 解析写入 clarification.json

用户对每条:
  - 标记无效 → status=invalid
  - 回复 → status=answered, answer=…

用户点击「应用澄清结果」
  → ACP 会话: 读取 clarification.json 有效条目 + prd.md → 重写 prd.md
  → parseStatus / revisedAt 更新
```

澄清模板 default body 示例：列出 PRD 中模糊、缺失、矛盾点，JSON 格式输出。

### 5.3 与人工评审的关系

人工评审阶段继续使用 **整个 worktree** 的文件编辑；`.dmonwork_worktree/prd.md` 在评审 Files 标签中可见。

---

## 6. 设置：需求设置

### 6.1 导航

在 `settings-navigation-workflow-sections.ts` 的 Workflows 组，**Automations 之后**插入:

```ts
{
  id: 'requirement-settings',
  title: '需求设置',
  description: '管理开始任务与需求澄清的提示词模板',
  icon: ListChecks, // 或 FileText
  group: 'workflows'
}
```

渲染器 `RequirementSettingsPane.tsx`:

- 顶部 Tabs: **开始任务模板** | **需求澄清模板**
- 每 tab 复用 `TodoTemplateManagerDialog` 的列表+编辑 UI（抽成共享 `TodoTemplateEditor`）
- Start task dialog 的 gear 改为跳转 Settings → 需求设置（或保留快捷入口）

### 6.2 IPC

| Channel | 说明 |
|---------|------|
| `todos:clarification-templates:*` | list/create/update/delete |
| `todos:requirement:init-worktree` | 创建目录结构（也可合入 create flow） |
| `todos:requirement:read-meta` / `write-meta` | _meta.json |
| `todos:requirement:read-clarification` / `write-clarification` | clarification.json |
| `todos:requirement:check-prd-mcp` | 返回 MCP 是否可用 |

Store slice 扩展: `todoClarificationTemplates`, actions 镜像 templates。

---

## 7. 架构与文件清单（实现指引）

### 7.1 Shared

- `shared/todo/todo-clarification-template.ts`
- `shared/todo/todo-requirement-worktree-paths.ts` — 路径常量与 join  helper
- `shared/todo/dingtalk-doc-parse-prompt.ts` — 从 dmon-work 移植
- `shared/todo/clarification-types.ts`
- `renderer/src/lib/markdown-image.ts` — 从 dmon-work 移植

### 7.2 Main

- `main/todos/todo-clarification-template-store.ts`
- `main/todos/todo-requirement-worktree-service.ts` — init dirs, read/write json
- `main/ipc/todo-requirement.ts`
- `todo-database.ts` schema v10: `todo_clarification_templates` + 可选 `requirement_meta` 列

### 7.3 Renderer

- `TodoDetailView.tsx` — header 标题
- `TodoRequirementPanel.tsx` + 子 tab 组件
- `RequirementWorktreeFilePane.tsx`
- `ClarificationPanel.tsx` + `ClarificationTemplatePicker.tsx`
- `PrdSupplementPanel.tsx`
- `RequirementSettingsPane.tsx`
- `TodoCreateDialog.tsx` — 创建后触发 worktree + parse
- `todo-start-workspace.ts` — 复用已有 worktree 分支

---

## 8. 错误处理

| 场景 | 行为 |
|------|------|
| 无 MCP | 创建成功，toast + 详情 banner；PRD tab 可手动编辑 stub |
| 解析失败 | `_meta.parseStatus=failed`，展示 error + 重试 |
| 无 bound worktree | 详情页 CTA「创建工作区」 |
| Folder project | 创建时 toast，不建 worktree |
| SSH remote repo | 遵循 ssh-execution-boundary：文档 IO 在 execution host |

---

## 9. 测试

- Unit: 路径 helper、clarification JSON 读写、prompt 构建、start 复用 worktree 分支
- Integration: create todo → worktree + `.dmonwork_worktree` 存在
- UI: TodoDetailView header snapshot；RequirementSettings 模板 CRUD
- 本地化: 所有新 UI 字符串 `translate` + 全 locale 更新 + verify scripts

---

## 10. 分阶段交付建议

| 阶段 | 内容 | 可独立上线 |
|------|------|-----------|
| **P0a** | Header 标题 + 创建时建 worktree/目录 + 开始任务复用 | ✅ |
| **P0b** | PRD stub + MCP 检测 + 解析 ACP + markdownImage | ✅ |
| **P0c** | 待办 PRD 编辑 + 文件树 | ✅ |
| **P1** | 需求设置 + 澄清模板 + 澄清流程 + 应用结果 | ✅ |
| **P1b** | PRD 补充 ACP panel | ✅ |

---

## 11. 方案取舍（已选）

**工作区时机:** 创建时建 git worktree + `.dmonwork_worktree`（用户已选）。

**澄清条目存储:** 文件 `clarification.json`（便于 agent 直接 Read/Write）优于纯 SQLite——选文件。

**模板存储:** 澄清与开始任务 **分表**，避免 template picker 混用。

**PRD 解析执行:** 后台 ACP 会话（与 dmon-work 一致），非 main 进程同步调 MCP——选 ACP。

---

## 12. 实现细节（已定 / 待你确认）

1. 创建成功后 **自动激活** 新 worktree：**是**（与开始任务一致，用户可切回）。
2. 看板卡片同行显示标题：**是**（identifier 行追加 truncated title）。
3. MCP 安装链接：使用 dmon-work 同款 aihub 链接。
4. 创建表单 **强制至少选一个 Orca 项目**：与「新建即建工作区」一致；当前代码里项目仍为可选，实现本 spec 时一并改为必填。
