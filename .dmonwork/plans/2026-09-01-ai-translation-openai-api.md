# AI Translation OpenAI-Compatible API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ddd-subagent-driven-development (recommended) or ddd-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将状态栏 AI 翻译从智能体 CLI 改为 OpenAI 兼容 `chat/completions` HTTP，并在 Appearance 配置 baseUrl / 加密 apiKey / model；未配置时弹层内联提醒并深链设置。

**Architecture:** main 进程 `fetch` + 独立 `AbortController` 取消通道；apiKey 加密落盘（对齐 speech OpenAI key）；baseUrl/model 进 `GlobalSettings` 并带默认值；彻底删除 translation 对 `runLocalPlanForAgent` / `cancelGenerateTranslationLocal` / `TextGenerationOperation:'translation'` 的依赖。

**Tech Stack:** Electron main `fetch`、现有 `secret-store`、Vitest、React Settings/StatusBar、`translate()` i18n。

**依据 spec：** `.dmonwork/specs/2026-09-01-ai-translation-openai-api-design.md`

## Global Constraints

- 不引入 `openai` npm 包；用 `fetch`。
- 不把 apiKey 写入 `GlobalSettings` / settings JSON。
- 不保留 CLI 智能体 AI 翻译兜底；用不到的相关代码必须删除。
- 默认 `baseUrl = https://dashscope.aliyuncs.com/compatible-mode/v1`，默认 `model = qwen-mt-flash`。
- 「已配置」判定：加密 apiKey 存在且非空；缺 key 时弹层内联提示 +「去设置」，不发起请求。
- 用户可见文案必须 `translate()`，并更新 `en`/`zh`/`ja`/`ko`/`es`。
- 验证命令 scoped：`npx vitest run --config config/vitest.config.ts <path> 2>&1 | tail -n 40`
- **提交：** 本仓库仅在用户明确要求时 `git commit`；任务里的 Commit 步骤默认跳过，除非用户说「提交」。

---

## 文件结构

**新增**
- `src/shared/translate-ai-defaults.ts` — 默认 baseUrl/model + resolve 辅助
- `src/main/text-translation/translate-ai-api-key-store.ts` — 加密 key 存取
- `src/main/text-translation/translate-ai-api-key-store.test.ts`
- `src/main/text-translation/openai-compatible-translation-client.ts` — HTTP client
- `src/main/text-translation/openai-compatible-translation-client.test.ts`
- `src/renderer/src/components/settings/appearance-translate-ai-search.ts` — 搜索/深链 id
- `src/renderer/src/components/settings/TranslateAiSettings.tsx` — Appearance 设置块
- `src/renderer/src/components/settings/TranslateAiSettings.test.tsx`
- `src/renderer/src/components/settings/TranslateAiApiKeyDialog.tsx` — 密码对话框（可仿 Voice）

**修改**
- `src/shared/global-settings-types.ts` — `translateAiBaseUrl?` / `translateAiModel?`
- `src/shared/constants.ts` — defaults（空串或省略均可，resolve 时套默认）
- `src/shared/text-translation-types.ts` — `agentLabel` 注释改为「AI 模式展示 model」；`ai-unavailable` detail 注释去 CLI
- `src/main/text-translation/ai-translation.ts` — 整文件改写为 HTTP
- `src/main/text-translation/ai-translation.test.ts` — 重写
- `src/main/ipc/text-translation-ipc.ts` — 增加 key CRUD；注入 settings
- `src/main/ipc/text-translation-ipc.test.ts`
- `src/preload/api/text-translation-api.ts` + `src/preload/index.ts`
- `src/renderer/.../AppearanceWindowSidebarSection.tsx` — 挂载设置
- `src/renderer/.../appearance-search.ts` + `appearance-usage-percentage-search.ts`（或新 search 文件的 deep link）
- `src/renderer/.../TranslateStatusSegment.tsx` (+ test)
- `src/renderer/.../TranslateResultPanel.tsx` (+ test) — fallback 文案去 “agent”
- locale JSON ×5

**删除 / 收紧（死代码清理，Task 7）**
- 删除 `cancelGenerateTranslationLocal`（`commit-message-text-generation.ts`）
- 从两处 `TextGenerationOperation` 联合类型去掉 `'translation'`：
  - `src/main/text-generation/source-control-text-generation-types.ts`
  - `src/main/text-generation/commit-message-text-generation.ts`
- `ai-translation.ts` 不再 import `planCommitMessageGeneration` / `resolveTextGenerationParams` / `runLocalPlanForAgent` / `commandBackslashMode` / `LocalGenerationTarget` / `homedir`（若仅为此存在）

---

### Task 1: 默认值与 GlobalSettings 字段

**Files:**
- Create: `src/shared/translate-ai-defaults.ts`
- Create: `src/shared/translate-ai-defaults.test.ts`
- Modify: `src/shared/global-settings-types.ts`（在 `translateDictionaryLookupEnabled` 旁）
- Modify: `src/shared/constants.ts`（defaults 可省略字段；若仓库偏好显式默认则写 `''`）

**Interfaces:**
- Produces:
  - `DEFAULT_TRANSLATE_AI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'`
  - `DEFAULT_TRANSLATE_AI_MODEL = 'qwen-mt-flash'`
  - `resolveTranslateAiBaseUrl(value: string | null | undefined): string`
  - `resolveTranslateAiModel(value: string | null | undefined): string`
  - trim 后空串 → 默认值

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSLATE_AI_BASE_URL,
  DEFAULT_TRANSLATE_AI_MODEL,
  resolveTranslateAiBaseUrl,
  resolveTranslateAiModel
} from './translate-ai-defaults'

describe('translate-ai-defaults', () => {
  it('falls back when missing or blank', () => {
    expect(resolveTranslateAiBaseUrl(undefined)).toBe(DEFAULT_TRANSLATE_AI_BASE_URL)
    expect(resolveTranslateAiBaseUrl('  ')).toBe(DEFAULT_TRANSLATE_AI_BASE_URL)
    expect(resolveTranslateAiModel(null)).toBe(DEFAULT_TRANSLATE_AI_MODEL)
  })

  it('keeps trimmed custom values', () => {
    expect(resolveTranslateAiBaseUrl(' https://example.com/v1 ')).toBe('https://example.com/v1')
    expect(resolveTranslateAiModel(' qwen-mt-flash ')).toBe('qwen-mt-flash')
  })
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/shared/translate-ai-defaults.test.ts 2>&1 | tail -n 30`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 最小实现 + 类型字段**

`translate-ai-defaults.ts` 实现上述导出；`GlobalSettings` 增加：

```ts
/** OpenAI-compatible chat base URL for status-bar AI translate; empty → DashScope default. */
translateAiBaseUrl?: string
/** Model id for status-bar AI translate; empty → qwen-mt-flash. */
translateAiModel?: string
```

- [ ] **Step 4: 跑测通过**

Run: 同上  
Expected: PASS

- [ ] **Step 5: Commit**（仅用户要求时）

---

### Task 2: 加密 API Key store

**Files:**
- Create: `src/main/text-translation/translate-ai-api-key-store.ts`
- Test: `src/main/text-translation/translate-ai-api-key-store.test.ts`

**Interfaces:**
- Consumes: `getSecretStore`、`orcaHomeDir`（对齐 `openai-api-key-store.ts`）
- Produces:
  - `hasTranslateAiApiKey(): boolean`
  - `saveTranslateAiApiKey(apiKey: string): void`
  - `readTranslateAiApiKey(): string`（无 key 则 throw）
  - `clearTranslateAiApiKey(): void`
  - 文件名：`translate-ai-api-key.enc`（在 Orca home）

- [ ] **Step 1: 写失败测试**（仿 `openai-api-key-store.test.ts`：tmp home、mock secret-store）

覆盖：`has*` 不 decrypt；`save` 后 `read` 命中缓存；`clear` 后 `has` 为 false；空串 save throw。

- [ ] **Step 2: 跑测确认失败**

Run: `npx vitest run --config config/vitest.config.ts src/main/text-translation/translate-ai-api-key-store.test.ts 2>&1 | tail -n 30`

- [ ] **Step 3: 实现 store**（可几乎照搬 speech store，改文件名与导出名；**不要**复用 speech 文件，密钥必须隔离）

- [ ] **Step 4: 跑测通过**

- [ ] **Step 5: Commit**（仅用户要求时）

---

### Task 3: OpenAI 兼容 translation client

**Files:**
- Create: `src/main/text-translation/openai-compatible-translation-client.ts`
- Test: `src/main/text-translation/openai-compatible-translation-client.test.ts`

**Interfaces:**
- Produces:

```ts
export type OpenAiCompatibleTranslationRequest = {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  signal?: AbortSignal
  timeoutMs?: number // default 60_000
  fetchImpl?: typeof fetch
}

export type OpenAiCompatibleTranslationResult =
  | { ok: true; text: string }
  | { ok: false; kind: 'unauthorized' | 'timeout' | 'offline' | 'aborted' | 'provider-error'; detail?: string }

export function joinChatCompletionsUrl(baseUrl: string): string
export async function requestOpenAiCompatibleTranslation(
  input: OpenAiCompatibleTranslationRequest
): Promise<OpenAiCompatibleTranslationResult>
```

- 行为：`POST joinChatCompletionsUrl(baseUrl)`，body `{ model, messages: [{ role:'user', content: prompt }] }`，Header `Authorization: Bearer …`
- `joinChatCompletionsUrl`：去尾 `/` 再拼 `/chat/completions`
- 401 → `unauthorized`；AbortError → `aborted`；超时 → `timeout`；网络 TypeError → `offline`；非 2xx / 空 content → `provider-error`；detail 脱敏（去掉 `sk-…`、Bearer token）

- [ ] **Step 1: 写失败测试**（mock `fetchImpl`）

至少：成功解析 content；baseUrl 带/不带尾斜杠；401；abort；空 choices；超时（可用假的 AbortSignal + 立即 abort 或 mock reject）。

- [ ] **Step 2: 跑测确认失败**

- [ ] **Step 3: 实现 client**

- [ ] **Step 4: 跑测通过**

- [ ] **Step 5: Commit**（仅用户要求时）

---

### Task 4: 改写 `translateTextWithAi`（HTTP）并重写测试

**Files:**
- Modify: `src/main/text-translation/ai-translation.ts`
- Modify: `src/main/text-translation/ai-translation.test.ts`

**Interfaces:**
- Consumes: Task 1 defaults、Task 2 store、Task 3 client、`buildTranslationPrompt`、`normalizeTranslationQuery`、语言 resolve
- Produces: 保持导出 `translateTextWithAi` / `cancelAiTranslation`；`TranslationSuccess.agentLabel` **填 model 名**
- 模块级（或 deps 可注入）`AbortController`：新请求 abort 旧请求；`cancelAiTranslation()` abort 当前

`AiTranslationDeps`：

```ts
export type AiTranslationDeps = {
  getSettings: () => GlobalSettings
  hasApiKey?: () => boolean
  readApiKey?: () => string
  requestTranslation?: typeof requestOpenAiCompatibleTranslation
}
```

映射：
- 无 key → `{ ok:false, kind:'ai-unavailable', detail: '…configure…' }`
- client `unauthorized` / `provider-error` → `ai-unavailable`
- `timeout` → `timeout`；`offline` → `offline`；`aborted` → `ai-unavailable` 或与现 cancel UX 一致（不写入 success；IPC 层可忽略）

- [ ] **Step 1: 重写测试（先红）**

删除对 `commit-message-text-generation` 的 mock。断言：
- 调用 `requestTranslation` 时带 resolve 后的 baseUrl/model、prompt 含目标语、signal
- 成功时 `providerId:'ai'` 且 `agentLabel === model`
- 无 key 不调用 request
- `cancelAiTranslation` abort 进行中的请求（可用 deferred promise + signal.aborted）

- [ ] **Step 2: 跑测确认旧实现失败 / 新断言红**

- [ ] **Step 3: 改写 `ai-translation.ts`（去掉全部 agent CLI import）**

- [ ] **Step 4: 跑测通过**

- [ ] **Step 5: Commit**（仅用户要求时）

---

### Task 5: IPC + preload（key CRUD）

**Files:**
- Modify: `src/main/ipc/text-translation-ipc.ts` (+ test)
- Modify: `src/preload/api/text-translation-api.ts`
- Modify: `src/preload/index.ts`（translation 段）
- 若 preload 类型聚合处需要同步更新

**Interfaces:**
- Channels（建议）：
  - `translation:getAiApiKeyStatus` → `{ configured: boolean }`
  - `translation:saveAiApiKey` `(apiKey: string)` → `{ configured: true }`
  - `translation:clearAiApiKey` → `{ configured: false }`
- Preload:

```ts
getAiApiKeyStatus: () => Promise<{ configured: boolean }>
saveAiApiKey: (apiKey: string) => Promise<{ configured: boolean }>
clearAiApiKey: () => Promise<{ configured: boolean }>
```

- 现有 `translateWithAi` / `cancelAi` 保持；handler 继续调改写后的 `translateTextWithAi`

- [ ] **Step 1: 扩展 IPC 测试**（mock key store）

- [ ] **Step 2: 实现 handlers + preload**

- [ ] **Step 3: 跑** `text-translation-ipc.test.ts` **通过**

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 6: Appearance 设置 UI + 深链 + 搜索

**Files:**
- Create: `appearance-translate-ai-search.ts`（含 `TRANSLATE_AI_SETTING_ID = 'translate-ai'`）
- Create: `TranslateAiApiKeyDialog.tsx` / `TranslateAiSettings.tsx` (+ test)
- Modify: `AppearanceWindowSidebarSection.tsx` — 在 `TranslateDictionaryLookupSetting` **下方**挂载
- Modify: `appearance-search.ts` — `getStatusBarEntries` 加入 AI translate entry
- Modify: `appearance-usage-percentage-search.ts` 的 `resolveAppearanceAccordionDeepLink`：**或**把 deep-link resolve 扩到同一函数 — `sectionId === 'translate-ai'` → `'window'`
- Modify: `appearance-usage-percentage-search.test.ts`（或新 test）覆盖 deep link

**UI 行为：**
- Base URL / Model：受控输入，blur 或显式保存时 `updateSettings({ translateAiBaseUrl, translateAiModel })`
- API Key：仿 `OpenAiTranscriptionSettingsRow` + Dialog；只显示 Connected；save/clear 走 preload
- 挂载时 `getAiApiKeyStatus()` 刷新 configured

**深链：** 设置块根节点 `id={TRANSLATE_AI_SETTING_ID}`，与 usage percentage 一样可被 Settings 滚动定位。

- [ ] **Step 1: 写 TranslateAiSettings 测试**（save model/baseUrl 调用 updateSettings；未配置显示 Add API key）

- [ ] **Step 2: 实现组件并挂 Appearance**

- [ ] **Step 3: deep link resolve 测试通过**

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 7: 死代码清理（CLI translation lane）

**Files:**
- Modify: `src/main/text-generation/commit-message-text-generation.ts` — **删除** `cancelGenerateTranslationLocal`；`TextGenerationOperation` 去掉 `'translation'`
- Modify: `src/main/text-generation/source-control-text-generation-types.ts` — 去掉 `'translation'`
- Grep 确认无残留引用（除 i18n namespace `'translation'` 资源包名——**不要动**）

- [ ] **Step 1: Grep**

```bash
rg -n "cancelGenerateTranslationLocal|TextGenerationOperation|'translation'" src/main/text-generation src/main/text-translation --glob '*.ts'
```

只应再看到将要删除的定义；`ai-translation` 不应再引用 generation。

- [ ] **Step 2: 删除导出与联合成员**

- [ ] **Step 3: 跑相关测试**

```bash
npx vitest run --config config/vitest.config.ts \
  src/main/text-translation \
  src/main/text-generation/commit-message-text-generation-regression.test.ts \
  2>&1 | tail -n 50
```

Expected: PASS（或仅与本次无关的既有失败——若有，记录但不扩大范围）

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 8: 翻译弹层 — 未配置内联提醒 + 文案

**Files:**
- Modify: `TranslateStatusSegment.tsx` (+ test)
- Modify: `TranslateResultPanel.tsx` (+ test) — fallback「the AI agent」→「AI」；hint 去 agent
- Modify: `translation-failure-message.ts` 若文案仍写 agent，改为 API

**行为：**
- 打开弹层或切到 AI 时拉取 `getAiApiKeyStatus`（或订阅 settings 页保存后的刷新；最少：toggle AI / open 时拉一次）
- `useAi && !configured`：输入区下内联提示 + button「去设置」：

```ts
openSettingsTarget({ pane: 'appearance', repoId: null, sectionId: TRANSLATE_AI_SETTING_ID })
openSettingsPage()
```

- `useAi && !configured` 时 `handleSubmit` 早退（不调用 `translateWithAi`）
- AI hint：`Use your configured OpenAI-compatible API instead of the free service`

- [ ] **Step 1: 扩展 TranslateStatusSegment.test** — 点 AI 无 key 出现提醒且不调用 translateWithAi；点去设置调用 openSettings*

- [ ] **Step 2: 实现 UI**

- [ ] **Step 3: ResultPanel 测试把 Claude/agent 断言改为 model 展示**

- [ ] **Step 4: 跑 status-bar translate 相关测试通过**

- [ ] **Step 5: Commit**（仅用户要求时）

---

### Task 9: 本地化

**Files:**
- 所有新/改 `translate('key', 'English')` 的 key 写入：
  - `src/renderer/src/i18n/locales/en.json`
  - `zh.json` / `ja.json` / `ko.json` / `es.json`（真实翻译，禁止非英文 locale 留英文）

- [ ] **Step 1: 跑** `pnpm run sync:localization-catalog`（若项目对该类 auto key 需要）

- [ ] **Step 2: 跑** `pnpm run verify:localization-catalog` 与 `pnpm run verify:localization-coverage`（触及 catalog 时）

- [ ] **Step 3: 修失败直至通过**

- [ ] **Step 4: Commit**（仅用户要求时）

---

### Task 10: 收尾验证

- [ ] **Step 1: Grep 死代码与密钥**

```bash
rg -n "runLocalPlanForAgent|cancelGenerateTranslationLocal|commitMessage.*translat|sk-[a-zA-Z0-9]" \
  src/main/text-translation src/renderer/src/components/status-bar src/renderer/src/components/settings \
  --glob '*.{ts,tsx}'
```

Expected: AI 翻译路径无 CLI；仓库中无硬编码用户 apiKey。

- [ ] **Step 2: 类型检查（scoped 若全量太慢则至少改动面）**

`pnpm tc:node` 与相关 web tc（或 `pnpm tc` 若可接受）

- [ ] **Step 3: 跑翻译相关测试全集**

```bash
npx vitest run --config config/vitest.config.ts \
  src/main/text-translation \
  src/main/ipc/text-translation-ipc.test.ts \
  src/shared/translate-ai-defaults.test.ts \
  src/renderer/src/components/status-bar/TranslateStatusSegment.test.tsx \
  src/renderer/src/components/status-bar/TranslateResultPanel.test.tsx \
  src/renderer/src/components/settings/TranslateAiSettings.test.tsx \
  2>&1 | tail -n 60
```

Expected: PASS

- [ ] **Step 4: 对照 spec 清单打勾**（settings、默认值、内联提醒、HTTP、取消、删 CLI）

---

## Spec 覆盖自检

| Spec 项 | Task |
|---------|------|
| HTTP OpenAI 兼容、无 CLI | 3, 4, 7 |
| baseUrl/apiKey/model 设置 + 默认 | 1, 2, 6 |
| 未配置内联 + 去设置 | 8 |
| translation 取消 lane（AbortController） | 4 |
| 加密 key、不进 settings | 2, 5 |
| 删无用代码 | 7, 10 |
| i18n | 9 |
| 测试 | 各 Task + 10 |
