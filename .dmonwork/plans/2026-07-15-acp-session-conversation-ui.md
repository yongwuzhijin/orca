# ACP Session Conversation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ddd-subagent-driven-development (recommended) or ddd-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Claude, Qoder, and Cursor todo sessions through one compact, theme-aware Cursor-style timeline with merged tool lifecycles and collapsible thoughts, file changes, commands, subagent runs, and generic tools.

**Architecture:** Keep `SessionConversation` and `SessionEvent` as the engine-neutral boundary. Derive stable presentation entries with pure functions, then render every expandable activity through one ACP disclosure shell and focused detail components. Do not change ACP transport, IPC, persistence, Native Chat, or engine launch behavior.

**Tech Stack:** React 19, TypeScript, Zustand-derived session data, Radix Collapsible, Tailwind semantic theme tokens, Lucide icons, Vitest, Testing Library, i18next.

## Global Constraints

- Claude, Qoder, and Cursor must use the same renderer with no engine-specific JSX branches.
- Use only Orca semantic color tokens; do not hardcode light/dark backgrounds.
- Use `translate(key, fallback)` for every new visible or accessible string and update en/zh/ja/ko/es with real translations.
- Follow TDD: add a failing focused test, run it, implement the minimum behavior, and rerun it.
- Preserve SSH-friendly streaming behavior and stable scroll position.
- Do not modify Native Chat behavior.
- Do not create Git commits unless the user explicitly requests them.

---

### Task 1: Build the stable ACP presentation timeline

**Files:**
- Create: `src/renderer/src/components/todo/detail/acp-session-timeline.ts`
- Create: `src/renderer/src/components/todo/detail/acp-session-timeline.test.ts`
- Modify: `src/renderer/src/components/todo/detail/SessionConversation.tsx`

**Interfaces:**
- Consumes: `SessionEvent[]` from `src/shared/acp/session-event.ts`.
- Produces: `buildAcpSessionTimeline(events: SessionEvent[]): SessionEvent[]`.
- Guarantees: adjacent text chunks are concatenated; non-empty matching `toolCallId` values merge in first-seen order; later defined tool fields win; input is never mutated.

- [ ] **Step 1: Write failing tests for chunk and lifecycle aggregation**

```ts
import { describe, expect, it } from 'vitest'
import { buildAcpSessionTimeline } from './acp-session-timeline'

describe('buildAcpSessionTimeline', () => {
  it('joins adjacent agent and thought chunks', () => {
    expect(
      buildAcpSessionTimeline([
        { kind: 'agent_message', text: 'Hel' },
        { kind: 'agent_message', text: 'lo' },
        { kind: 'thought', text: 'Check ' },
        { kind: 'thought', text: 'files' }
      ])
    ).toEqual([
      { kind: 'agent_message', text: 'Hello' },
      { kind: 'thought', text: 'Check files' }
    ])
  })

  it('merges a tool lifecycle at its first position', () => {
    const events = buildAcpSessionTimeline([
      { kind: 'tool_call', toolCallId: 'call-1', title: 'Bash', status: 'pending', rawInput: { command: 'pnpm test' } },
      { kind: 'agent_message', text: 'Running tests' },
      { kind: 'tool_call', toolCallId: 'call-1', title: 'Bash', status: 'completed', content: { output: 'PASS' } }
    ])
    expect(events).toEqual([
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        status: 'completed',
        rawInput: { command: 'pnpm test' },
        content: { output: 'PASS' }
      },
      { kind: 'agent_message', text: 'Running tests' }
    ])
  })

  it('does not merge tool calls with missing ids', () => {
    const event = { kind: 'tool_call' as const, toolCallId: '', title: 'Unknown' }
    expect(buildAcpSessionTimeline([event, event])).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/acp-session-timeline.test.ts
```

Expected: FAIL because `acp-session-timeline.ts` does not exist.

- [ ] **Step 3: Implement immutable timeline aggregation**

```ts
import type { SessionEvent } from '../../../../../shared/acp/session-event'

type ToolCallEvent = Extract<SessionEvent, { kind: 'tool_call' }>

function mergeToolCall(previous: ToolCallEvent, next: ToolCallEvent): ToolCallEvent {
  return {
    ...previous,
    ...next,
    rawInput: next.rawInput ?? previous.rawInput,
    content: next.content ?? previous.content
  }
}

export function buildAcpSessionTimeline(events: SessionEvent[]): SessionEvent[] {
  const timeline: SessionEvent[] = []
  const toolIndexes = new Map<string, number>()

  for (const event of events) {
    const previous = timeline.at(-1)
    if (
      (event.kind === 'agent_message' || event.kind === 'thought') &&
      previous?.kind === event.kind
    ) {
      timeline[timeline.length - 1] = { ...previous, text: previous.text + event.text }
      continue
    }
    if (event.kind === 'tool_call' && event.toolCallId) {
      const index = toolIndexes.get(event.toolCallId)
      if (index !== undefined) {
        timeline[index] = mergeToolCall(timeline[index] as ToolCallEvent, event)
        continue
      }
      toolIndexes.set(event.toolCallId, timeline.length)
    }
    timeline.push(event)
  }
  return timeline
}
```

- [ ] **Step 4: Render the derived timeline from `SessionConversation`**

Add:

```ts
const timeline = React.useMemo(() => buildAcpSessionTimeline(events), [events])
```

and map `timeline` instead of `events`. Use a stable key: `tool:${toolCallId}` for identified tool calls and the derived index for other entries.

- [ ] **Step 5: Run timeline and conversation tests**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/acp-session-timeline.test.ts src/renderer/src/components/todo/detail/SessionConversation.test.tsx
```

Expected: PASS.

---

### Task 2: Classify ACP tools and extract readable details

**Files:**
- Create: `src/renderer/src/components/todo/detail/acp-tool-presentation.ts`
- Create: `src/renderer/src/components/todo/detail/acp-tool-presentation.test.ts`

**Interfaces:**
- Consumes: `Extract<SessionEvent, { kind: 'tool_call' }>`.
- Produces:

```ts
type AcpToolPresentation =
  | { kind: 'file'; title: string; path: string | null; added: number; removed: number; lines: AcpDiffLine[] }
  | { kind: 'command'; title: string; command: string | null; output: string | null }
  | { kind: 'subagent'; title: string; model: string | null; stage: string | null; result: string | null }
  | { kind: 'generic'; title: string; detail: string | null }

type AcpDiffLine = { kind: 'add' | 'del' | 'context' | 'meta'; text: string }
```

- [ ] **Step 1: Write failing classification tests**

Cover these exact cases:

```ts
it('classifies edit payloads and counts changed lines', () => {
  expect(
    presentAcpToolCall({
      kind: 'tool_call',
      toolCallId: 'edit-1',
      title: 'Edit',
      toolKind: 'edit',
      rawInput: { path: 'src/a.ts', old_string: 'old', new_string: 'new\nline' }
    })
  ).toMatchObject({ kind: 'file', path: 'src/a.ts', added: 2, removed: 1 })
})

it('classifies bash payloads and extracts output', () => {
  expect(
    presentAcpToolCall({
      kind: 'tool_call',
      toolCallId: 'bash-1',
      title: 'Bash',
      toolKind: 'execute',
      rawInput: { command: 'pnpm test' },
      content: { output: 'PASS' }
    })
  ).toMatchObject({ kind: 'command', command: 'pnpm test', output: 'PASS' })
})

it('falls back to formatted generic detail', () => {
  expect(
    presentAcpToolCall({
      kind: 'tool_call',
      toolCallId: 'x',
      title: 'Skill',
      rawInput: { name: 'review' }
    })
  ).toMatchObject({ kind: 'generic', detail: '{\n  "name": "review"\n}' })
})

it('classifies a subagent run and extracts its display metadata', () => {
  expect(
    presentAcpToolCall({
      kind: 'tool_call',
      toolCallId: 'agent-1',
      title: 'Subagent',
      toolKind: 'task',
      status: 'running',
      rawInput: {
        description: '实现 ACP 时间线',
        model: 'GPT-5.6 Sol Medium',
        prompt: '实现并验证时间线'
      },
      content: { output: '2 个测试文件全部通过' }
    })
  ).toMatchObject({
    kind: 'subagent',
    title: '实现 ACP 时间线',
    model: 'GPT-5.6 Sol Medium',
    stage: '实现并验证时间线',
    result: '2 个测试文件全部通过'
  })
})
```

Also test unified-diff text, string content, malformed values, and missing path/command.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/acp-tool-presentation.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement conservative field extraction**

Implement local type guards for records and strings. Recognize subagent tools before
generic command/file fallbacks from `toolKind` values containing `task|subagent|agent`,
titles matching `Task|Subagent`, or payloads containing `subagent_type`. Read the
display title from `description|title|name`, model from `model`, current stage from
`stage|statusText|prompt`, and final result from `output|result|text|content`.

Recognize file tools from
`toolKind` values containing `edit`, `write`, or `patch`, titles matching
`Edit|Write|MultiEdit|apply_patch|str_replace`, or a payload containing old/new text.
Recognize commands from kinds containing `execute|terminal|shell|command`, titles
matching `Bash|Shell|Terminal|Command`, or a payload containing `command|cmd`.

For file input, read paths from `path|file_path|filePath`; old text from
`old_string|oldString|old`; and new text from
`new_string|newString|new|content|file_text`. Parse unified diff text when available.
For command output, read `output|stdout|text|content`, recursively through one record
or content-block array. Stringify the first meaningful unknown payload for generic
details without throwing.

- [ ] **Step 4: Run classification tests**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/acp-tool-presentation.test.ts
```

Expected: PASS.

---

### Task 3: Add the shared disclosure shell and Cursor-style detail renderers

**Files:**
- Create: `src/renderer/src/components/todo/detail/SessionDisclosure.tsx`
- Create: `src/renderer/src/components/todo/detail/SessionDisclosure.test.tsx`
- Create: `src/renderer/src/components/todo/detail/SessionToolDetails.tsx`
- Create: `src/renderer/src/components/todo/detail/SessionToolDetails.test.tsx`
- Modify: `src/renderer/src/components/todo/detail/session-event-item.tsx`
- Modify: `src/renderer/src/components/todo/detail/session-event-item.test.tsx`

**Interfaces:**
- `SessionDisclosure` props:

```ts
type SessionDisclosureProps = {
  entryKey: string
  title: React.ReactNode
  meta?: React.ReactNode
  running?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}
```

- `SessionToolDetails` consumes one tool-call `SessionEvent` and renders the presentation returned by `presentAcpToolCall`.

- [ ] **Step 1: Write failing disclosure behavior tests**

Use Testing Library to verify:

- a running entry starts open;
- a completed historical entry starts closed;
- clicking toggles `aria-expanded`;
- a user-collapsed running entry remains closed after rerender with completed status;
- Enter and Space toggle the trigger.

The manual override test must rerender the same `entryKey`:

```tsx
const { rerender } = render(
  <SessionDisclosure entryKey="call-1" title="Bash" running>
    <div>output</div>
  </SessionDisclosure>
)
fireEvent.click(screen.getByRole('button', { name: /Bash/i }))
rerender(
  <SessionDisclosure entryKey="call-1" title="Bash" running={false}>
    <div>output</div>
  </SessionDisclosure>
)
expect(screen.getByRole('button', { name: /Bash/i })).toHaveAttribute('aria-expanded', 'false')
```

- [ ] **Step 2: Run the disclosure test and verify RED**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/SessionDisclosure.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `SessionDisclosure` with the existing Radix primitive**

Use `Collapsible`, `CollapsibleTrigger`, and `CollapsibleContent` from
`@/components/ui/collapsible`. Use `ChevronRight` and rotate it when open. Keep open
state locally, track whether the user has toggled with a ref, and only auto-open a
running entry before manual override. The trigger must be a real button with
`aria-expanded`, focus ring, and a full-width compact row.

Required semantic styling:

```tsx
className="group flex w-full items-center gap-1.5 rounded-md py-1 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
```

Use `transition-transform motion-reduce:transition-none` for the chevron and a subtle
content reveal that also disables transition under reduced motion.

- [ ] **Step 4: Write failing detail-renderer tests**

Verify:

- file summary includes path and `+2 / -1`;
- expanded file content has line markers and uses
  `var(--git-decoration-added)` / `var(--git-decoration-deleted)`;
- command summary shows the command and expanded content shows output in a bounded
  `scrollbar-sleek` region;
- running subagent summary shows a spinner, task name, model, and muted current stage;
- completed subagent summary replaces the spinner with a static state and expanded
  content preserves the final result;
- generic tool detail renders formatted JSON;
- malformed data renders the title without throwing.

- [ ] **Step 5: Implement the detail renderers**

`SessionToolDetails` must:

- render file rows with a monospace path, green/red semantic counts, and a line-number
  column;
- render commands in `font-mono`, with command and output on `bg-accent`;
- render subagents as a compact two-line activity row matching the Cursor reference:
  task name plus optional model on the first line, muted stage on the second line,
  `Loader2` while running, and a static bullet/check state after completion;
- render generic detail in a bounded `pre`;
- use only semantic classes and CSS variables already defined by Orca;
- use `scrollbar-sleek` on every overflowing region.

- [ ] **Step 6: Route thought and tool events through the shared shell**

Update `SessionEventItem`:

- render thoughts through `SessionDisclosure`, collapsed by default;
- render tool calls through `SessionToolDetails`, with `running` derived from
  `pending|running|in_progress` status values;
- keep user and agent message treatments unchanged;
- preserve the proprietary `ext` fallback.

- [ ] **Step 7: Run component tests**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/SessionDisclosure.test.tsx src/renderer/src/components/todo/detail/SessionToolDetails.test.tsx src/renderer/src/components/todo/detail/session-event-item.test.tsx src/renderer/src/components/todo/detail/SessionConversation.test.tsx
```

Expected: PASS.

---

### Task 4: Localize, integrate, and verify the complete ACP conversation

**Files:**
- Modify: `src/renderer/src/i18n/locales/en.json`
- Modify: `src/renderer/src/i18n/locales/zh.json`
- Modify: `src/renderer/src/i18n/locales/ja.json`
- Modify: `src/renderer/src/i18n/locales/ko.json`
- Modify: `src/renderer/src/i18n/locales/es.json`
- Modify: `src/renderer/src/components/todo/detail/SessionToolDetails.tsx`
- Modify: `src/renderer/src/components/todo/detail/SessionToolDetails.test.tsx`
- Modify: `src/renderer/src/components/todo/detail/SessionConversation.test.tsx`

**Interfaces:**
- Adds localized ACP conversation labels under
  `auto.components.todo.detail.session-event-item`.
- Keeps existing `Thought`, ask mode, cancel, follow-up, and send keys compatible.

- [ ] **Step 1: Add an integration test for a mixed engine-neutral timeline**

Render `SessionConversation` with a user message, two thought chunks, pending/completed
updates for one Bash `toolCallId`, a file edit, and a subagent run. Assert:

- the two thought chunks appear under one disclosure;
- Bash appears once and has completed status;
- the edit summary exposes the file path and counts;
- the subagent appears once with its task name/model and retains its final result;
- no engine prop or engine-specific branch is required.

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/SessionConversation.test.tsx
```

Expected: FAIL until all labels and integrated render paths are complete.

- [ ] **Step 3: Add real translations**

Add localized values for any new status fallback, file-change summary accessibility
label, command output label, subagent result label, and generic detail label. Use natural translations:

- English: `Changes`, `Command output`, `Subagent result`, `Details`
- Chinese: `修改`, `命令输出`, `子代理结果`, `详情`
- Japanese: `変更`, `コマンド出力`, `サブエージェントの結果`, `詳細`
- Korean: `변경 사항`, `명령 출력`, `하위 에이전트 결과`, `세부 정보`
- Spanish: `Cambios`, `Salida del comando`, `Resultado del subagente`, `Detalles`

Do not add labels that are not rendered.

Format known protocol statuses before rendering them in `SessionToolDetails`:

- `pending` → Pending / 等待中 / 保留中 / 대기 중 / Pendiente
- `running|in_progress` → Running / 运行中 / 実行中 / 실행 중 / En curso
- `completed|complete|success|succeeded` → Completed / 已完成 / 完了 / 완료 / Completado
- `error|failed|failure` → Failed / 失败 / 失敗 / 실패 / Fallido
- `canceled|cancelled` → Canceled / 已取消 / キャンセル済み / 취소됨 / Cancelado

Unknown engine-provided statuses remain visible as received. Add component tests for
the aliases and translated output; do not change status semantics or icon selection.

- [ ] **Step 4: Sync and verify localization catalogs**

Run:

```bash
pnpm run sync:localization-catalog
pnpm run verify:localization-catalog
pnpm run verify:localization-coverage
```

Expected: all commands exit 0.

- [ ] **Step 5: Run all focused ACP UI tests**

Run:

```bash
pnpm vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/acp-session-timeline.test.ts src/renderer/src/components/todo/detail/acp-tool-presentation.test.ts src/renderer/src/components/todo/detail/SessionDisclosure.test.tsx src/renderer/src/components/todo/detail/SessionToolDetails.test.tsx src/renderer/src/components/todo/detail/session-event-item.test.tsx src/renderer/src/components/todo/detail/SessionConversation.test.tsx src/renderer/src/store/slices/acp-session-event-mapping.test.ts src/renderer/src/store/slices/acp.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run static verification**

Run:

```bash
pnpm run typecheck
pnpm run lint
```

Expected: both commands exit 0 with no new diagnostics.

- [ ] **Step 7: Verify the running app in light and dark themes**

With the existing dev server, open a todo with an ACP session and verify:

1. Claude, Qoder, and Cursor sessions render through the same conversation layout.
2. A running tool opens automatically.
3. Manual collapse remains respected when the tool completes.
4. File and command details expand without moving duplicate lifecycle rows.
5. App light/dark/system theme changes update every background and foreground.
6. Long command output scrolls inside the entry.

Record any unavailable live-engine state as a manual verification limitation; do not
substitute hardcoded fixture UI into production.
