import { describe, expect, it, vi } from 'vitest'
import type { TodoItem } from '../../shared/todo/todo-item'
import type { TodoStatus } from '../../shared/todo/todo-status'
import type { TodoOrchestratorConfig } from '../../shared/todo/todo-orchestrator-config'
import {
  TodoOrchestratorService,
  type OrchestratorDeps,
  type OrchestratorDispatchInput
} from './todo-orchestrator-service'

function item(over: Partial<TodoItem>): TodoItem {
  return {
    id: 'id',
    identifier: 'T-1',
    projectId: 'p',
    title: 't',
    description: '',
    status: 'todo',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    workspaceProjectId: null,
    workspaceName: null,
    preferredAgent: null,
    orderKey: 'm',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    autoPilotEnabled: true,
    autoPilotMaxTurns: null,
    ...over
  }
}

const cfg = (over: Partial<TodoOrchestratorConfig> = {}): TodoOrchestratorConfig => ({
  enabled: true,
  maxConcurrent: 2,
  tickMs: 15_000,
  defaultMaxTurns: 10,
  ...over
})

// A dispatch we can settle by hand, so a slot's lifetime is fully under test control.
function deferredDispatch() {
  const resolvers: ((v: { sessionId: string }) => void)[] = []
  const rejecters: ((e: unknown) => void)[] = []
  const fn = vi.fn<(input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>>(
    () =>
      new Promise<{ sessionId: string }>((res, rej) => {
        resolvers.push(res)
        rejecters.push(rej)
      })
  )
  return {
    fn,
    resolveNext: () => resolvers.shift()?.({ sessionId: 's' }),
    rejectNext: () => rejecters.shift()?.(new Error('boom'))
  }
}

// Status-aware harness: listCandidates mirrors listAutoPilotCandidates — only
// status==='todo' rows are offered, and updateStatus mutates that view. This is why
// a dispatched (in_progress) task never re-enters the pool and the tick loop settles.
function makeService(opts: {
  candidates?: TodoItem[]
  resolveCwd?: (item: TodoItem) => string | null
  dispatch?: OrchestratorDeps['dispatch']
  getConfig?: () => TodoOrchestratorConfig
}): {
  service: TodoOrchestratorService
  updateStatus: ReturnType<typeof vi.fn>
  statuses: Map<string, TodoStatus>
} {
  const base = opts.candidates ?? []
  const statuses = new Map<string, TodoStatus>()
  const updateStatus = vi.fn((id: string, s: TodoStatus) => {
    statuses.set(id, s)
  })
  const deps: OrchestratorDeps = {
    listCandidates: () => base.filter((c) => (statuses.get(c.id) ?? c.status) === 'todo'),
    updateStatus,
    resolveCwd: opts.resolveCwd ?? (() => '/repo'),
    dispatch:
      opts.dispatch ??
      vi.fn<(input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>>(async () => ({
        sessionId: 's'
      })),
    getConfig: opts.getConfig ?? (() => cfg())
  }
  return { service: new TodoOrchestratorService(deps), updateStatus, statuses }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('TodoOrchestratorService.tick', () => {
  it('does nothing when disabled', async () => {
    const dispatch = vi.fn<(input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>>(
      async () => ({
        sessionId: 's'
      })
    )
    const { service } = makeService({
      candidates: [item({ id: 'a' })],
      getConfig: () => cfg({ enabled: false }),
      dispatch
    })
    await service.tick()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches candidates in sorted order up to available slots', async () => {
    const { fn } = deferredDispatch()
    const { service } = makeService({
      candidates: [
        item({ id: 'low', priority: 'low' }),
        item({ id: 'urgent', priority: 'urgent' }),
        item({ id: 'none', priority: 'none' })
      ],
      getConfig: () => cfg({ maxConcurrent: 2 }),
      dispatch: fn
    })
    await service.tick()
    expect(fn.mock.calls.map((c) => c[0].taskId)).toEqual(['urgent', 'low'])
  })

  it('flips status to in_progress and passes prompt/cwd/autoPilot on dispatch', async () => {
    const dispatch = vi.fn<(input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>>(
      async () => ({
        sessionId: 's'
      })
    )
    const { service, updateStatus } = makeService({
      candidates: [item({ id: 'a', preferredAgent: 'qoder', autoPilotMaxTurns: 3 })],
      resolveCwd: () => '/work',
      dispatch,
      getConfig: () => cfg({ maxConcurrent: 1, defaultMaxTurns: 10 })
    })
    await service.tick()
    await flush()
    expect(updateStatus).toHaveBeenCalledWith('a', 'in_progress')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'a',
        engine: 'qoder',
        cwd: '/work',
        autoPilot: { maxTurns: 3 }
      })
    )
    // a is in_progress after dispatch → not re-offered → no runaway re-dispatch.
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('falls back to defaultMaxTurns when task autoPilotMaxTurns is null', async () => {
    const dispatch = vi.fn<(input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>>(
      async () => ({
        sessionId: 's'
      })
    )
    const { service } = makeService({
      candidates: [item({ id: 'a', autoPilotMaxTurns: null })],
      dispatch,
      getConfig: () => cfg({ maxConcurrent: 1, defaultMaxTurns: 9 })
    })
    await service.tick()
    await flush()
    expect(dispatch.mock.calls[0][0].autoPilot).toEqual({ maxTurns: 9 })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('skips a candidate whose cwd cannot resolve, without flipping status', async () => {
    const dispatch = vi.fn<(input: OrchestratorDispatchInput) => Promise<{ sessionId: string }>>(
      async () => ({
        sessionId: 's'
      })
    )
    const { service, updateStatus } = makeService({
      candidates: [item({ id: 'a' })],
      resolveCwd: () => null,
      dispatch
    })
    await service.tick()
    expect(dispatch).not.toHaveBeenCalled()
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('holds a slot for the whole dispatch and frees it on resolve', async () => {
    const { fn, resolveNext } = deferredDispatch()
    const { service } = makeService({
      candidates: [item({ id: 'a' }), item({ id: 'b', orderKey: 'n' })],
      getConfig: () => cfg({ maxConcurrent: 1 }),
      dispatch: fn
    })
    await service.tick() // dispatches 'a', slot full
    expect(fn).toHaveBeenCalledTimes(1)
    await service.tick() // no free slot
    expect(fn).toHaveBeenCalledTimes(1)
    resolveNext() // 'a' finishes → slot frees → re-evaluate dispatches 'b' (a now in_progress)
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[1][0].taskId).toBe('b')
  })

  it('releases the slot on reject, lets another candidate take it, and leaves the failed task in_progress', async () => {
    const { fn, rejectNext } = deferredDispatch()
    const { service, statuses } = makeService({
      candidates: [item({ id: 'a' }), item({ id: 'b', orderKey: 'n' })],
      getConfig: () => cfg({ maxConcurrent: 1 }),
      dispatch: fn
    })
    await service.tick() // dispatches 'a', slot full
    expect(fn).toHaveBeenCalledTimes(1)
    rejectNext() // 'a' fails → slot frees → re-evaluate dispatches 'b'
    await flush()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[1][0].taskId).toBe('b')
    // Failed task is not reset — it waits in_progress for a human (no auto-retry).
    expect(statuses.get('a')).toBe('in_progress')
  })

  it('does not re-dispatch a candidate already live', async () => {
    const { fn } = deferredDispatch()
    const { service } = makeService({
      candidates: [item({ id: 'a' })],
      getConfig: () => cfg({ maxConcurrent: 2 }),
      dispatch: fn
    })
    await service.tick()
    await service.tick()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('frees the slot when updateStatus throws synchronously (no capacity leak)', async () => {
    const { fn } = deferredDispatch()
    const statuses = new Map<string, TodoStatus>()
    // Simulate a row deleted mid-tick: the first status flip throws, later ones succeed.
    let failFirst = true
    const updateStatus = vi.fn((id: string, s: TodoStatus) => {
      if (id === 'a' && failFirst) {
        failFirst = false
        throw new Error('row vanished')
      }
      statuses.set(id, s)
    })
    const items = [item({ id: 'a' })]
    const service = new TodoOrchestratorService({
      listCandidates: () => items.filter((c) => (statuses.get(c.id) ?? c.status) === 'todo'),
      updateStatus,
      resolveCwd: () => '/repo',
      dispatch: fn,
      getConfig: () => cfg({ maxConcurrent: 1 })
    })
    await service.tick() // throw before dispatch → slot must be released, no dispatch
    expect(fn).not.toHaveBeenCalled()
    // If the slot had leaked, this tick would see 0 free slots and skip. It dispatches,
    // proving the reservation was freed.
    await service.tick()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
