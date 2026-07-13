# TODO Board P3 — Human Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `human_review` placeholder in `TodoDetailView` into a working review workspace: auto-detect the task's dev-server URL from its cwd, preview it in an embedded lightweight browser (desktop/mobile viewport), verify via the reused conversation panel, and decide (Approve → `merging` / Reject → `rework`).

**Architecture:** A task runs ACP in a **cwd only** (no Orca worktreeId), so P3 cannot reuse the worktree-coupled `BrowserPane`/`EmulatorPane`. Instead a thin main-process IPC reads the task's latest `AcpSessionRecord.cwd`, builds a `WorkspacePortProbe` from it, and reuses the existing path-based `scanWorkspacePortProbes` to detect the dev server. The renderer mounts a raw Electron `<webview>` at the detected URL and reuses the P2b `InProgressPanel` (Plan + SessionConversation) for the verify column.

**Tech Stack:** Electron (main + preload + `<webview>`), React + Zustand (renderer), TypeScript, vitest + @testing-library/react (happy-dom).

**Spec:** `.dmonwork/specs/2026-07-12-todo-board-p3-human-review-design.md`

---

## File Structure

**Main process:**
- Create `src/main/acp/review-port-scan.ts` — pure fn: latest session cwd → probe → `scanWorkspacePortProbes` → `WorkspacePort[]`.
- Create `src/main/ipc/todo-review.ts` — registers `todos:review.scanPorts` handler.
- Modify `src/main/ipc/register-core-handlers.ts` — wire the handler to the acp kernel + port scanner.

**Preload:**
- Modify `src/preload/index.ts` — expose `window.api.todos.review.scanPorts`.
- Modify `src/preload/api-types.ts` — type the new method.

**Renderer (all under `src/renderer/src/components/todo/detail/`):**
- Create `review-port-url.ts` — pure fn: `WorkspacePort` → preview URL string.
- Create `review-webview.ts` — imperative `<webview>` ensure/update (partition, UA, src).
- Create `ReviewBrowserPane.tsx` — preview pane + toolbar (URL, reload, back/forward, desktop/mobile).
- Create `ReviewDecisionBar.tsx` — Approve → `merging` / Reject → `rework`.
- Create `HumanReviewPanel.tsx` — composes ReviewBrowserPane + `InProgressPanel` + ReviewDecisionBar.
- Modify `TodoDetailView.tsx` — `human_review` branch renders `HumanReviewPanel`.

**Reused unchanged:** `InProgressPanel.tsx` (verify column), `scanWorkspacePortProbes`, `AcpSessionRepository.listByTask`, `ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE`.

**Verification commands (repo-wide):**
- Typecheck: `pnpm typecheck`
- Lint (incl. max-lines ratchet + localization): `pnpm lint`
- Single test file: `npx vitest run --config config/vitest.config.ts <path>`
- i18n catalog sync (after adding `translate(...)` keys): `pnpm run sync:localization-catalog`

---

## Task 1: `scanReviewPortsForTask` pure function

**Files:**
- Create: `src/main/acp/review-port-scan.ts`
- Test: `src/main/acp/review-port-scan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/acp/review-port-scan.test.ts
import { describe, it, expect, vi } from 'vitest'
import { scanReviewPortsForTask } from './review-port-scan'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type { WorkspacePort, WorkspacePortScanResult } from '../../shared/workspace-ports'

function rec(overrides: Partial<AcpSessionRecord> = {}): AcpSessionRecord {
  return {
    id: 's1',
    taskId: 't1',
    engine: 'claude',
    sessionId: 'sess1',
    cwd: '/repo/app',
    status: 'completed',
    stopReason: null,
    startedAt: '',
    endedAt: null,
    createdAt: '2026-07-12T00:00:00.000Z',
    ...overrides
  }
}

function scanResult(ports: WorkspacePort[]): WorkspacePortScanResult {
  return { platform: 'darwin', scannedAt: 0, ports }
}

describe('scanReviewPortsForTask', () => {
  it('returns [] when the task has no sessions', async () => {
    const scan = vi.fn()
    const out = await scanReviewPortsForTask({ listByTask: () => [], scan }, 't1')
    expect(out).toEqual([])
    expect(scan).not.toHaveBeenCalled()
  })

  it('builds a probe from the latest session cwd and returns scanned ports', async () => {
    const port: WorkspacePort = {
      id: 'p1',
      bindHost: '0.0.0.0',
      connectHost: 'localhost',
      port: 5173,
      protocol: 'http',
      kind: 'workspace',
      owner: {
        worktreeId: 't1',
        repoId: 't1',
        displayName: 't1',
        path: '/repo/app',
        confidence: 'cwd'
      }
    }
    const scan = vi.fn().mockResolvedValue(scanResult([port]))
    const out = await scanReviewPortsForTask(
      { listByTask: () => [rec({ cwd: '/repo/app' })], scan },
      't1'
    )
    expect(scan).toHaveBeenCalledWith([
      { id: 't1', repoId: 't1', displayName: 't1', path: '/repo/app' }
    ])
    expect(out).toEqual([port])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/main/acp/review-port-scan.test.ts`
Expected: FAIL — `Cannot find module './review-port-scan'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/acp/review-port-scan.ts
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type {
  WorkspacePort,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '../../shared/workspace-ports'

export type ReviewPortScanDeps = {
  listByTask: (taskId: string) => AcpSessionRecord[]
  scan: (probes: readonly WorkspacePortProbe[]) => Promise<WorkspacePortScanResult>
}

// Tasks run ACP in a cwd only (no worktreeId). Reuse path-based port attribution
// by turning the latest session's cwd into an ad-hoc probe.
export async function scanReviewPortsForTask(
  deps: ReviewPortScanDeps,
  taskId: string
): Promise<WorkspacePort[]> {
  const latest = deps.listByTask(taskId)[0]
  if (!latest || !latest.cwd) {
    return []
  }
  const probe: WorkspacePortProbe = {
    id: taskId,
    repoId: taskId,
    displayName: taskId,
    path: latest.cwd
  }
  const result = await deps.scan([probe])
  return result.ports
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/main/acp/review-port-scan.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/acp/review-port-scan.ts src/main/acp/review-port-scan.test.ts
git commit -m "feat(todo-p3): add scanReviewPortsForTask (cwd -> workspace ports)"
```

---

## Task 2: `todos:review.scanPorts` IPC handler + wiring

**Files:**
- Create: `src/main/ipc/todo-review.ts`
- Test: `src/main/ipc/todo-review.test.ts`
- Modify: `src/main/ipc/register-core-handlers.ts` (imports near top; call site after `registerAcpHandlers({...})` at ~line 199-203)

- [ ] **Step 1: Write the failing test**

```ts
// src/main/ipc/todo-review.test.ts
import { describe, it, expect, vi } from 'vitest'
import { registerTodoReviewHandlers } from './todo-review'
import type { WorkspacePort } from '../../shared/workspace-ports'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>()
  return {
    ipcMain: {
      handle: (ch: string, fn: (e: unknown, arg: unknown) => unknown) => handlers.set(ch, fn)
    },
    invoke: (ch: string, arg: unknown) => handlers.get(ch)!({}, arg),
    handlers
  }
}

describe('registerTodoReviewHandlers', () => {
  it('todos:review.scanPorts delegates to scanReviewPorts with taskId', async () => {
    const f = fakeIpc()
    const ports: WorkspacePort[] = [
      {
        id: 'p1',
        bindHost: '0.0.0.0',
        connectHost: 'localhost',
        port: 3000,
        protocol: 'http',
        kind: 'workspace',
        owner: {
          worktreeId: 't1',
          repoId: 't1',
          displayName: 't1',
          path: '/repo',
          confidence: 'cwd'
        }
      }
    ]
    const scanReviewPorts = vi.fn().mockResolvedValue(ports)
    registerTodoReviewHandlers({ scanReviewPorts }, f.ipcMain as never)
    const out = await f.invoke('todos:review.scanPorts', { taskId: 't1' })
    expect(scanReviewPorts).toHaveBeenCalledWith('t1')
    expect(out).toEqual(ports)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/main/ipc/todo-review.test.ts`
Expected: FAIL — `Cannot find module './todo-review'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/ipc/todo-review.ts
import { ipcMain as defaultIpcMain } from 'electron'
import type { WorkspacePort } from '../../shared/workspace-ports'

export type TodoReviewHandlerDeps = {
  scanReviewPorts: (taskId: string) => Promise<WorkspacePort[]>
}

type IpcMainLike = {
  handle: (channel: string, fn: (e: unknown, arg: never) => unknown) => void
}

export function registerTodoReviewHandlers(
  deps: TodoReviewHandlerDeps,
  ipcMain: IpcMainLike = defaultIpcMain as unknown as IpcMainLike
): void {
  ipcMain.handle('todos:review.scanPorts', (_e, arg: { taskId: string }) =>
    deps.scanReviewPorts(arg.taskId)
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/main/ipc/todo-review.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Wire the handler into core handlers**

In `src/main/ipc/register-core-handlers.ts`, add these imports alongside the existing import block (the file already imports `registerAcpHandlers` from `./acp` at line 61):

```ts
import { registerTodoReviewHandlers } from './todo-review'
import { scanReviewPortsForTask } from '../acp/review-port-scan'
import { scanWorkspacePortProbes } from '../ports/workspace-port-ownership'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
```

Then, immediately after the existing `registerAcpHandlers({ ... })` call (currently ends at ~line 203), add:

```ts
  registerTodoReviewHandlers({
    scanReviewPorts: (taskId) =>
      scanReviewPortsForTask(
        {
          listByTask: (id) => acpKernel.sessionManager.listSessions(id) as AcpSessionRecord[],
          scan: scanWorkspacePortProbes
        },
        taskId
      )
  })
```

(`acpKernel` is already in scope from `const acpKernel = runtime.getAcpKernel()` at line 198.)

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no errors). This confirms `acpKernel.sessionManager.listSessions` and the cast to `AcpSessionRecord[]` are valid.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/todo-review.ts src/main/ipc/todo-review.test.ts src/main/ipc/register-core-handlers.ts
git commit -m "feat(todo-p3): register todos:review.scanPorts IPC wired to acp kernel"
```

---

## Task 3: Expose `window.api.todos.review.scanPorts` (preload + types)

**Files:**
- Modify: `src/preload/index.ts` (todos block at ~line 4200; add `WorkspacePort` import near existing shared-type imports)
- Modify: `src/preload/api-types.ts` (todos block at line 3083; `WorkspacePort` is imported from `../shared/workspace-ports` alongside the existing `WorkspacePortScanResult` etc. at lines 378-382)

- [ ] **Step 1: Add the preload binding**

In `src/preload/index.ts`, ensure `WorkspacePort` is imported from the shared workspace-ports module (the file already imports other shared types; add `WorkspacePort` to that import list or add a new import):

```ts
import type { WorkspacePort } from '../shared/workspace-ports'
```

Then inside the `todos: {` object (line 4200), add a `review` group after the `templates` group (after line 4229's `delete` and its closing `}`), so the todos object gains:

```ts
    review: {
      scanPorts: (input: { taskId: string }): Promise<WorkspacePort[]> =>
        ipcRenderer.invoke('todos:review.scanPorts', input)
    }
```

- [ ] **Step 2: Add the type**

In `src/preload/api-types.ts`, add `WorkspacePort` to the existing `import type { ... } from '../shared/workspace-ports'` block (which already lists `WorkspacePortScanResult` at line 382). Then inside the `todos: {` type (line 3083), after the `templates` group, add:

```ts
    review: {
      scanPorts: (input: { taskId: string }) => Promise<WorkspacePort[]>
    }
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS. (Preload is glue verified by the type system; renderer tests in later tasks mock `window.api.todos.review.scanPorts` directly.)

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.ts src/preload/api-types.ts
git commit -m "feat(todo-p3): expose window.api.todos.review.scanPorts"
```

---

## Task 4: `portToPreviewUrl` pure helper

**Files:**
- Create: `src/renderer/src/components/todo/detail/review-port-url.ts`
- Test: `src/renderer/src/components/todo/detail/review-port-url.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/src/components/todo/detail/review-port-url.test.ts
import { describe, it, expect } from 'vitest'
import { portToPreviewUrl } from './review-port-url'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'

function workspacePort(overrides: Partial<WorkspacePort> = {}): WorkspacePort {
  return {
    id: 'p1',
    bindHost: '0.0.0.0',
    connectHost: 'localhost',
    port: 5173,
    protocol: 'http',
    kind: 'workspace',
    owner: { worktreeId: 't', repoId: 't', displayName: 't', path: '/x', confidence: 'cwd' },
    ...overrides
  } as WorkspacePort
}

describe('portToPreviewUrl', () => {
  it('prefers advertisedUrl when present on a workspace port', () => {
    const p = workspacePort({ advertisedUrl: 'https://localhost:5173/' } as Partial<WorkspacePort>)
    expect(portToPreviewUrl(p)).toBe('https://localhost:5173/')
  })

  it('falls back to protocol://connectHost:port', () => {
    expect(portToPreviewUrl(workspacePort())).toBe('http://localhost:5173')
  })

  it('uses https when protocol is https', () => {
    expect(portToPreviewUrl(workspacePort({ protocol: 'https', port: 8443 }))).toBe(
      'https://localhost:8443'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/review-port-url.test.ts`
Expected: FAIL — `Cannot find module './review-port-url'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/src/components/todo/detail/review-port-url.ts
import type { WorkspacePort } from '../../../../../shared/workspace-ports'

// Prefer the terminal-advertised origin (Vite prints the real scheme/host); fall
// back to a synthesized origin from the raw listener fields.
export function portToPreviewUrl(port: WorkspacePort): string {
  if (port.kind === 'workspace' && port.advertisedUrl) {
    return port.advertisedUrl
  }
  const scheme = port.protocol === 'https' ? 'https' : 'http'
  return `${scheme}://${port.connectHost}:${port.port}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/review-port-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/todo/detail/review-port-url.ts src/renderer/src/components/todo/detail/review-port-url.test.ts
git commit -m "feat(todo-p3): add portToPreviewUrl helper"
```

---

## Task 5: `ensureReviewWebview` imperative mount helper

**Files:**
- Create: `src/renderer/src/components/todo/detail/review-webview.ts`
- Test: `src/renderer/src/components/todo/detail/review-webview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/review-webview.test.ts
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, it, expect } from 'vitest'
import { ensureReviewWebview, REVIEW_MOBILE_USER_AGENT } from './review-webview'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ensureReviewWebview', () => {
  it('creates a single partitioned webview and sets src', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    ensureReviewWebview({ container, taskId: 't1', url: 'http://localhost:3000', mobile: false })
    ensureReviewWebview({ container, taskId: 't1', url: 'http://localhost:3000', mobile: false })
    const webviews = container.querySelectorAll('webview')
    expect(webviews).toHaveLength(1)
    expect(webviews[0].getAttribute('partition')).toBe('review:t1')
    expect(webviews[0].getAttribute('src')).toBe('http://localhost:3000')
  })

  it('sets mobile UA when mobile and removes it on desktop', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    ensureReviewWebview({ container, taskId: 't1', url: 'http://x', mobile: true })
    expect(container.querySelector('webview')!.getAttribute('useragent')).toBe(
      REVIEW_MOBILE_USER_AGENT
    )
    ensureReviewWebview({ container, taskId: 't1', url: 'http://x', mobile: false })
    expect(container.querySelector('webview')!.getAttribute('useragent')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/review-webview.test.ts`
Expected: FAIL — `Cannot find module './review-webview'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/src/components/todo/detail/review-webview.ts
import { ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../../shared/browser-guest-web-preferences'

export const REVIEW_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// Mirrors browser-page-webview.ts: partition + shared webpreferences attribute.
// Each task gets an isolated `review:{taskId}` partition.
export function ensureReviewWebview({
  container,
  taskId,
  url,
  mobile
}: {
  container: HTMLDivElement
  taskId: string
  url: string
  mobile: boolean
}): Electron.WebviewTag {
  let webview = container.querySelector('webview') as Electron.WebviewTag | null
  if (!webview) {
    webview = document.createElement('webview') as Electron.WebviewTag
    webview.setAttribute('partition', `review:${taskId}`)
    webview.setAttribute('allowpopups', '')
    webview.setAttribute('webpreferences', ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
    webview.style.flex = '1'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    webview.style.background = '#ffffff'
    container.appendChild(webview)
  }
  if (mobile) {
    webview.setAttribute('useragent', REVIEW_MOBILE_USER_AGENT)
  } else {
    webview.removeAttribute('useragent')
  }
  if (webview.getAttribute('src') !== url) {
    webview.setAttribute('src', url)
  }
  return webview
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/review-webview.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/todo/detail/review-webview.ts src/renderer/src/components/todo/detail/review-webview.test.ts
git commit -m "feat(todo-p3): add ensureReviewWebview mount helper"
```

---

## Task 6: `ReviewBrowserPane` component

**Files:**
- Create: `src/renderer/src/components/todo/detail/ReviewBrowserPane.tsx`
- Test: `src/renderer/src/components/todo/detail/ReviewBrowserPane.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/ReviewBrowserPane.test.tsx
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'

function workspacePort(port: number, advertisedUrl?: string): WorkspacePort {
  return {
    id: `p${port}`,
    bindHost: '0.0.0.0',
    connectHost: 'localhost',
    port,
    protocol: 'http',
    kind: 'workspace',
    owner: { worktreeId: 't', repoId: 't', displayName: 't', path: '/x', confidence: 'cwd' },
    ...(advertisedUrl ? { advertisedUrl } : {})
  } as WorkspacePort
}

const scanPorts = vi.fn()

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    todos: { review: { scanPorts } }
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const { ReviewBrowserPane } = await import('./ReviewBrowserPane')

describe('ReviewBrowserPane', () => {
  it('scans on mount and fills the URL from the first detected port', async () => {
    scanPorts.mockResolvedValue([workspacePort(5173)])
    render(<ReviewBrowserPane taskId="t1" />)
    expect(scanPorts).toHaveBeenCalledWith({ taskId: 't1' })
    expect(await screen.findByDisplayValue('http://localhost:5173')).toBeInTheDocument()
  })

  it('shows a manual URL field when no ports are detected', async () => {
    scanPorts.mockResolvedValue([])
    render(<ReviewBrowserPane taskId="t1" />)
    const input = (await screen.findByPlaceholderText(/http/i)) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('toggles mobile viewport', async () => {
    scanPorts.mockResolvedValue([workspacePort(3000)])
    render(<ReviewBrowserPane taskId="t1" />)
    await screen.findByDisplayValue('http://localhost:3000')
    const mobileBtn = screen.getByRole('button', { name: /mobile/i })
    fireEvent.click(mobileBtn)
    expect(mobileBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/ReviewBrowserPane.test.tsx`
Expected: FAIL — `Cannot find module './ReviewBrowserPane'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/renderer/src/components/todo/detail/ReviewBrowserPane.tsx
import React from 'react'
import { RotateCw, ChevronLeft, ChevronRight, Monitor, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'
import { portToPreviewUrl } from './review-port-url'
import { ensureReviewWebview } from './review-webview'

type ReviewBrowserPaneProps = {
  taskId: string
}

export function ReviewBrowserPane({ taskId }: ReviewBrowserPaneProps): React.JSX.Element {
  const [ports, setPorts] = React.useState<WorkspacePort[]>([])
  const [url, setUrl] = React.useState('')
  const [mobile, setMobile] = React.useState(false)
  const viewportRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void window.api.todos.review.scanPorts({ taskId }).then((detected) => {
      if (cancelled) {
        return
      }
      setPorts(detected)
      if (detected.length > 0) {
        setUrl(portToPreviewUrl(detected[0]))
      }
    })
    return () => {
      cancelled = true
    }
  }, [taskId])

  React.useEffect(() => {
    const container = viewportRef.current
    if (!container || !url) {
      return
    }
    ensureReviewWebview({ container, taskId, url, mobile })
  }, [taskId, url, mobile])

  const webview = (): Electron.WebviewTag | null =>
    (viewportRef.current?.querySelector('webview') as Electron.WebviewTag | null) ?? null

  const reload = (): void => {
    const wv = webview()
    if (wv && typeof wv.reload === 'function') {
      wv.reload()
    }
  }
  const back = (): void => {
    const wv = webview()
    if (wv && typeof wv.goBack === 'function') {
      wv.goBack()
    }
  }
  const forward = (): void => {
    const wv = webview()
    if (wv && typeof wv.goForward === 'function') {
      wv.goForward()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Button size="icon" variant="ghost" onClick={back} aria-label="back">
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={forward} aria-label="forward">
          <ChevronRight className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={reload} aria-label="reload">
          <RotateCw className="size-4" />
        </Button>
        <Input
          value={url}
          placeholder={translate(
            'auto.components.todo.detail.ReviewBrowserPane.urlPlaceholder',
            'http://localhost:...'
          )}
          onChange={(e) => setUrl(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
        {ports.length > 1 ? (
          <select
            className="h-7 rounded border border-border bg-background text-xs"
            onChange={(e) => setUrl(e.target.value)}
            value={url}
          >
            {ports.map((p) => {
              const u = portToPreviewUrl(p)
              return (
                <option key={p.id} value={u}>
                  {u}
                </option>
              )
            })}
          </select>
        ) : null}
        <Button
          size="icon"
          variant={mobile ? 'ghost' : 'secondary'}
          aria-label="desktop"
          aria-pressed={!mobile}
          onClick={() => setMobile(false)}
        >
          <Monitor className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={mobile ? 'secondary' : 'ghost'}
          aria-label="mobile"
          aria-pressed={mobile}
          onClick={() => setMobile(true)}
        >
          <Smartphone className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-muted">
        <div
          ref={viewportRef}
          className="flex min-h-0 flex-1"
          style={mobile ? { maxWidth: '390px' } : undefined}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/ReviewBrowserPane.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Sync localization + commit**

```bash
pnpm run sync:localization-catalog
git add src/renderer/src/components/todo/detail/ReviewBrowserPane.tsx src/renderer/src/components/todo/detail/ReviewBrowserPane.test.tsx locales
git commit -m "feat(todo-p3): add ReviewBrowserPane (auto-detect URL + viewport toggle)"
```

---

## Task 7: `ReviewDecisionBar` component

**Files:**
- Create: `src/renderer/src/components/todo/detail/ReviewDecisionBar.tsx`
- Test: `src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx`

> Scope note: spec §3.3 marks the reject-note input **optional**. P3 implements pure status transitions only (Approve → `merging`, Reject → `rework`); the note field is deferred (YAGNI).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const updateTodoItem = vi.fn().mockResolvedValue(undefined)
const mockState = { updateTodoItem }

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { ReviewDecisionBar } = await import('./ReviewDecisionBar')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mkItem(): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'x',
    description: '',
    status: 'human_review',
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
    sessionId: null
  }
}

describe('ReviewDecisionBar', () => {
  it('Approve moves the item to merging', () => {
    render(<ReviewDecisionBar item={mkItem()} />)
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))
    expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'merging' })
  })

  it('Reject moves the item to rework', () => {
    render(<ReviewDecisionBar item={mkItem()} />)
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'rework' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx`
Expected: FAIL — `Cannot find module './ReviewDecisionBar'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/renderer/src/components/todo/detail/ReviewDecisionBar.tsx
import React from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

type ReviewDecisionBarProps = {
  item: TodoItem
}

export function ReviewDecisionBar({ item }: ReviewDecisionBarProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void updateTodoItem(item.id, { status: 'rework' })}
      >
        <X className="mr-1 size-4" />
        {translate('auto.components.todo.detail.ReviewDecisionBar.reject', 'Reject')}
      </Button>
      <Button size="sm" onClick={() => void updateTodoItem(item.id, { status: 'merging' })}>
        <Check className="mr-1 size-4" />
        {translate('auto.components.todo.detail.ReviewDecisionBar.approve', 'Approve')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Sync localization + commit**

```bash
pnpm run sync:localization-catalog
git add src/renderer/src/components/todo/detail/ReviewDecisionBar.tsx src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx locales
git commit -m "feat(todo-p3): add ReviewDecisionBar (approve->merging, reject->rework)"
```

---

## Task 8: `HumanReviewPanel` container

**Files:**
- Create: `src/renderer/src/components/todo/detail/HumanReviewPanel.tsx`
- Test: `src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

vi.mock('./ReviewBrowserPane', () => ({ ReviewBrowserPane: () => <div>review-browser</div> }))
vi.mock('./InProgressPanel', () => ({ InProgressPanel: () => <div>in-progress-panel</div> }))
vi.mock('./ReviewDecisionBar', () => ({ ReviewDecisionBar: () => <div>decision-bar</div> }))

const { HumanReviewPanel } = await import('./HumanReviewPanel')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mkItem(): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'x',
    description: '',
    status: 'human_review',
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
    sessionId: null
  }
}

describe('HumanReviewPanel', () => {
  it('renders preview, verify panel, and decision bar', () => {
    render(<HumanReviewPanel item={mkItem()} />)
    expect(screen.getByText('review-browser')).toBeInTheDocument()
    expect(screen.getByText('in-progress-panel')).toBeInTheDocument()
    expect(screen.getByText('decision-bar')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx`
Expected: FAIL — `Cannot find module './HumanReviewPanel'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/renderer/src/components/todo/detail/HumanReviewPanel.tsx
import React from 'react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { ReviewBrowserPane } from './ReviewBrowserPane'
import { InProgressPanel } from './InProgressPanel'
import { ReviewDecisionBar } from './ReviewDecisionBar'

type HumanReviewPanelProps = {
  item: TodoItem
}

// Preview (left) + verify conversation reused from In Progress (right) + decision bar.
export function HumanReviewPanel({ item }: HumanReviewPanelProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <ReviewBrowserPane taskId={item.id} />
        <div className="min-h-0 overflow-hidden">
          <InProgressPanel item={item} />
        </div>
      </div>
      <ReviewDecisionBar item={item} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/todo/detail/HumanReviewPanel.tsx src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx
git commit -m "feat(todo-p3): add HumanReviewPanel container"
```

---

## Task 9: Wire `HumanReviewPanel` into `TodoDetailView`

**Files:**
- Modify: `src/renderer/src/components/todo/detail/TodoDetailView.tsx` (import at top; `human_review` branch at lines 58-64)
- Modify: `src/renderer/src/components/todo/detail/TodoDetailView.test.tsx` (the `human_review` test at lines expecting `/P3/i`)

- [ ] **Step 1: Update the test to expect HumanReviewPanel**

In `src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`, add a stub mock next to the existing `InProgressPanel` mock (after the `vi.mock('./InProgressPanel', ...)` block):

```tsx
vi.mock('./HumanReviewPanel', () => ({
  HumanReviewPanel: () => <div>human-review-panel</div>
}))
```

Then replace the existing `human_review` test body:

```tsx
  it('renders the HumanReviewPanel for human_review', () => {
    items = [mkItem({ status: 'human_review' })]
    render(<TodoDetailView itemId="t1" />)
    expect(screen.getByText('human-review-panel')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`
Expected: FAIL — the `human_review` branch still renders the "coming in P3" placeholder, so `human-review-panel` is not found.

- [ ] **Step 3: Wire the component**

In `src/renderer/src/components/todo/detail/TodoDetailView.tsx`, add the import after the existing `EnterInProgressDialog` import (line 10):

```tsx
import { HumanReviewPanel } from './HumanReviewPanel'
```

Then replace the `human_review` branch (lines 58-64) — currently:

```tsx
        ) : item.status === 'human_review' ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {translate(
              'auto.components.todo.detail.TodoDetailView.humanReviewP3',
              'Human Review — coming in P3'
            )}
          </div>
        ) : (
```

with:

```tsx
        ) : item.status === 'human_review' ? (
          <HumanReviewPanel item={item} />
        ) : (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config config/vitest.config.ts src/renderer/src/components/todo/detail/TodoDetailView.test.tsx`
Expected: PASS (all 4 tests, including the new `human_review` assertion).

- [ ] **Step 5: Sync localization + commit**

The obsolete `humanReviewP3` key is now unused; run the sync so the catalog reflects removal.

```bash
pnpm run sync:localization-catalog
git add src/renderer/src/components/todo/detail/TodoDetailView.tsx src/renderer/src/components/todo/detail/TodoDetailView.test.tsx locales
git commit -m "feat(todo-p3): render HumanReviewPanel in human_review status"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Lint (incl. max-lines ratchet + localization coverage)**

Run: `pnpm lint`
Expected: PASS. If max-lines flags a file, split it (do NOT add a `max-lines` disable — see AGENTS.md). If localization coverage fails, run `pnpm run sync:localization-catalog` and re-stage `locales`.

- [ ] **Step 3: Run the full P3 test set**

Run:
```bash
npx vitest run --config config/vitest.config.ts \
  src/main/acp/review-port-scan.test.ts \
  src/main/ipc/todo-review.test.ts \
  src/renderer/src/components/todo/detail/review-port-url.test.ts \
  src/renderer/src/components/todo/detail/review-webview.test.ts \
  src/renderer/src/components/todo/detail/ReviewBrowserPane.test.tsx \
  src/renderer/src/components/todo/detail/ReviewDecisionBar.test.tsx \
  src/renderer/src/components/todo/detail/HumanReviewPanel.test.tsx \
  src/renderer/src/components/todo/detail/TodoDetailView.test.tsx
```
Expected: all PASS.

- [ ] **Step 4: Manual UI check**

Launch the app, open a task in `human_review` (drive one to completion so ACP auto-transitions `in_progress → human_review`, or move a task there manually). Verify:
1. Preview pane scans and auto-loads the dev-server URL (or shows the manual URL field when nothing is detected).
2. Desktop/mobile toggle constrains the webview width.
3. Reload / back / forward act on the preview.
4. The verify column shows the completed conversation + plan; a follow-up prompt can be sent (resume).
5. Approve moves the task to `merging`; Reject moves it to `rework`.

If you cannot exercise the webview in your environment, say so explicitly rather than claiming success.

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to complete the work.

---

## Self-Review

**Spec coverage (spec §1.1 goals → tasks):**
1. Replace `human_review` placeholder → Task 9. ✓
2. Embedded lightweight browser + auto-detect + toolbar → Tasks 4, 5, 6. ✓
3. Responsive viewport toggle → Tasks 5, 6. ✓
4. Reuse SessionConversation/PlanChecklist (via InProgressPanel) → Task 8. ✓
5. Decision bar (Approve→merging / Reject→rework) → Task 7. ✓
6. Thin IPC `todos:review.scanPorts` reusing `scanWorkspacePortProbes` → Tasks 1, 2, 3. ✓
7. TDD throughout → every task is test-first. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test asserts concrete values. ✓

**Type consistency:**
- `scanReviewPortsForTask(deps, taskId)` deps `{ listByTask, scan }` — same in Task 1 impl, Task 2 wiring. ✓
- `registerTodoReviewHandlers({ scanReviewPorts })` — same in Task 2 impl/test and Task 2 wiring. ✓
- `window.api.todos.review.scanPorts({ taskId }): Promise<WorkspacePort[]>` — same in Task 3 preload/types and Task 6 usage/test. ✓
- `portToPreviewUrl(port)` — Task 4 defines, Task 6 imports. ✓
- `ensureReviewWebview({ container, taskId, url, mobile })` + `REVIEW_MOBILE_USER_AGENT` — Task 5 defines, Task 6 imports. ✓
- `ReviewBrowserPane({ taskId })`, `ReviewDecisionBar({ item })`, `HumanReviewPanel({ item })` — consistent across definition, composition (Task 8), and wiring (Task 9). ✓

**Scope check:** Single subsystem (Human Review), one cohesive plan producing testable software. ✓
