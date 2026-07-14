# Todo Locked Default Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use ddd-subagent-driven-development (recommended) or ddd-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always ensure a built-in `todo-default` project exists, lock the Todo UI to it, and remove project switching.

**Architecture:** Shared constants + `TodoRepository.ensureDefaultProject()` invoked from `listProjects()`. Renderer store always sets `todoActiveProjectId` to the default id. `TodoPage` drops `TodoProjectSwitcher` and the empty-project gate.

**Tech Stack:** TypeScript, better-sqlite3 via TodoDatabase, Zustand, Vitest, React Testing Library

## Global Constraints

- Spec: `.dmonwork/specs/2026-07-14-todo-default-project-lock-design.md`
- Fixed id `todo-default`, name `Default`, prefix `TODO`
- Do not migrate or delete legacy projects/tasks
- Do not disable max-lines; follow STYLEGUIDE for any UI leftovers
- TDD; commit after each task

## File map

| File | Role |
|------|------|
| `src/shared/todo/todo-default-project.ts` | Constants |
| `src/main/todos/todo-repository.ts` | `ensureDefaultProject` + call from `listProjects` |
| `src/main/todos/todo-repository.test.ts` | Repository tests |
| `src/renderer/src/store/slices/todos.ts` | Force active id |
| `src/renderer/src/store/slices/todos-default-project.test.ts` | Store unit test (new) |
| `src/renderer/src/components/todo/TodoPage.tsx` | Remove switcher / empty gate |
| `src/renderer/src/components/todo/TodoPage.test.tsx` | Assert no switcher |

---

### Task 1: Shared constants + repository ensure

**Files:**
- Create: `src/shared/todo/todo-default-project.ts`
- Modify: `src/main/todos/todo-repository.ts`
- Modify: `src/main/todos/todo-repository.test.ts`

**Interfaces:**
- Produces: `DEFAULT_TODO_PROJECT_ID`, `DEFAULT_TODO_PROJECT_NAME`, `DEFAULT_TODO_PROJECT_PREFIX`, `ensureDefaultProject(): TodoProject`

- [ ] **Step 1: Write failing tests** in `todo-repository.test.ts`:

```ts
import {
  DEFAULT_TODO_PROJECT_ID,
  DEFAULT_TODO_PROJECT_NAME,
  DEFAULT_TODO_PROJECT_PREFIX
} from '../../shared/todo/todo-default-project'

describe('ensureDefaultProject', () => {
  it('creates the default project when missing', () => {
    const repo = createRepo()
    const project = repo.ensureDefaultProject()
    expect(project).toEqual(
      expect.objectContaining({
        id: DEFAULT_TODO_PROJECT_ID,
        name: DEFAULT_TODO_PROJECT_NAME,
        identifierPrefix: DEFAULT_TODO_PROJECT_PREFIX,
        nextSequence: 1,
        defaultWorkingDir: null
      })
    )
  })

  it('is idempotent and preserves defaultWorkingDir', () => {
    const repo = createRepo()
    repo.ensureDefaultProject()
    repo.updateProject({ id: DEFAULT_TODO_PROJECT_ID, defaultWorkingDir: '/work' })
    const again = repo.ensureDefaultProject()
    expect(again.defaultWorkingDir).toBe('/work')
    expect(repo.listProjects().filter((p) => p.id === DEFAULT_TODO_PROJECT_ID)).toHaveLength(1)
  })

  it('listProjects ensures the default project exists', () => {
    const repo = createRepo()
    const list = repo.listProjects()
    expect(list.some((p) => p.id === DEFAULT_TODO_PROJECT_ID)).toBe(true)
  })
})
```

Adjust existing tests that assume empty lists / single-project lists after `listProjects` (they will always include default).

- [ ] **Step 2: Run tests — expect FAIL** (missing module / method)

```bash
pnpm exec vitest run --config config/vitest.config.ts src/main/todos/todo-repository.test.ts
```

- [ ] **Step 3: Implement constants + ensure + wire listProjects**

```ts
// src/shared/todo/todo-default-project.ts
export const DEFAULT_TODO_PROJECT_ID = 'todo-default'
export const DEFAULT_TODO_PROJECT_NAME = 'Default'
export const DEFAULT_TODO_PROJECT_PREFIX = 'TODO'
```

```ts
ensureDefaultProject(): TodoProject {
  const existing = this.db
    .prepare('SELECT * FROM todo_projects WHERE id = ?')
    .get(DEFAULT_TODO_PROJECT_ID) as TodoProjectRow | undefined
  if (existing) return rowToProject(existing)
  const timestamp = nowIso()
  this.db
    .prepare(
      `INSERT INTO todo_projects (id, name, identifier_prefix, next_sequence, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
    .run(
      DEFAULT_TODO_PROJECT_ID,
      DEFAULT_TODO_PROJECT_NAME,
      DEFAULT_TODO_PROJECT_PREFIX,
      timestamp,
      timestamp
    )
  return this.requireProject(DEFAULT_TODO_PROJECT_ID)
}

listProjects(): TodoProject[] {
  this.ensureDefaultProject()
  // ... existing SELECT
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit** `feat(todo): ensure built-in default project on list`

---

### Task 2: Store always selects default project

**Files:**
- Modify: `src/renderer/src/store/slices/todos.ts`
- Create: `src/renderer/src/store/slices/todos-default-project.test.ts`

- [ ] **Step 1: Failing test** — mock `window.api.todos.projects.list` returning a legacy project only; after `loadTodoProjects`, `todoActiveProjectId === DEFAULT_TODO_PROJECT_ID` (note: main process will normally ensure default is in the list; store must still force the id even if list is weird). Prefer asserting force-select when list includes default + legacy and previous active was legacy id.

```ts
it('forces active project to the built-in default', async () => {
  // Arrange store with createTodosSlice + mock list returning [legacy, default]
  await slice.loadTodoProjects()
  expect(get().todoActiveProjectId).toBe(DEFAULT_TODO_PROJECT_ID)
})
```

If slice is hard to unit-test in isolation, test via a thin extract:

```ts
export function resolveActiveTodoProjectId(_current: string | null): string {
  return DEFAULT_TODO_PROJECT_ID
}
```

Prefer inlining force in `loadTodoProjects` and testing with a minimal zustand store harness if the repo already has slice test patterns; otherwise add `resolveActiveTodoProjectId` in the shared constants file or a tiny `todo-active-project.ts` next to the slice.

**Recommended (YAGNI):** change `loadTodoProjects` to:

```ts
set({
  todoProjects: projects,
  todoActiveProjectId: DEFAULT_TODO_PROJECT_ID,
  todoLoaded: true
})
```

And unit-test that assignment path with a mocked `window.api` + importing `createTodosSlice` into a tiny store — follow any existing zustand slice test; if none, put the pure helper in `src/shared/todo/todo-default-project.ts`:

```ts
export function resolveLockedTodoActiveProjectId(): string {
  return DEFAULT_TODO_PROJECT_ID
}
```

Test the helper + use it in the slice (still valuable as documentation of the lock).

- [ ] **Step 2–4:** fail → implement → pass
- [ ] **Step 5: Commit** `feat(todo): lock active todo project to default id`

---

### Task 3: Remove project switcher from TodoPage

**Files:**
- Modify: `src/renderer/src/components/todo/TodoPage.tsx`
- Modify: `src/renderer/src/components/todo/TodoPage.test.tsx`
- Leave `TodoProjectSwitcher.tsx` unmounted (do not delete unless unused imports break lint)

- [ ] **Step 1: Update TodoPage.test.tsx**

```ts
it('does not render the project switcher', () => {
  render(<TodoPage />)
  expect(screen.queryByTestId('switcher')).not.toBeInTheDocument()
})
```

Remove the `TodoProjectSwitcher` mock (or keep mock but assert absence — if component not imported, mock unused; remove mock).

Also assert New task is enabled when `todoActiveProjectId` is default (already `p1` in fakeState — set to `todo-default`).

- [ ] **Step 2: Run — FAIL** (switcher still rendered via mock currently always present if we keep mounting — first remove mock usage by changing page)

Order: write test expecting no switcher → remove `<TodoProjectSwitcher />` and empty-state branch → pass.

TodoPage changes:
- Drop import and JSX for `TodoProjectSwitcher`
- Remove `!activeProjectId` empty branch; always render board/dashboard when not in detail
- Keep `createOpen && activeProjectId` guard OR rely on always-set id; prefer `activeProjectId` still from store (will be default after load)

- [ ] **Step 3–4:** implement → pass
- [ ] **Step 5: Commit** `feat(todo): hide project switcher on todo page`

---

### Task 4: Verification

- [ ] Run:

```bash
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/todos/todo-repository.test.ts \
  src/renderer/src/components/todo/TodoPage.test.tsx \
  src/renderer/src/store/slices/todos-default-project.test.ts
```

- [ ] Confirm all green; fix any listProjects length assumptions in other todo tests if they broke.

---

## Spec coverage

| Spec section | Task |
|--------------|------|
| §3 constants + ensure | Task 1 |
| §3 list ensure, no migration | Task 1 |
| §4 store force active | Task 2 |
| §4 remove switcher / empty gate | Task 3 |
| §5 tests | Tasks 1–3 |
| §7 order | Tasks 1→2→3→4 |
