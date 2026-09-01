// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const readDir = vi.fn()

const mockState = {
  todoProjects: [{ id: 'p1', defaultWorkingDir: '/local/fallback' }],
  activeSessionByTask: {} as Record<string, string | null>,
  sessionStatusBySession: {} as Record<string, string | undefined>,
  autoPilotByTask: {} as Record<string, { turn: number; maxTurns: number } | null>,
  projectHostSetups: [
    {
      id: 'setup-1',
      projectId: 'wp-1',
      hostId: 'ssh-host',
      repoId: 'repo-1',
      path: '/remote/repo',
      displayName: 'wp',
      setupState: 'ready' as const,
      setupMethod: 'imported-existing-folder' as const,
      connectionId: 'ssh-1',
      createdAt: 1,
      updatedAt: 1
    }
  ]
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { useDesignDocFiles } = await import('./use-design-doc-files')

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'ORCA-12',
    projectId: 'p1',
    title: 'Ship feature',
    description: '',
    status: 'solution_design',
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
    workspaceProjectId: 'wp-1',
    workspaceProjectIds: ['wp-1'],
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    prdLink: null,
    executionMode: null,
    boundWorktreeId: null,
    designStageEnabled: true,
    ...overrides
  }
}

describe('useDesignDocFiles', () => {
  beforeEach(() => {
    readDir.mockResolvedValue([])
    mockState.activeSessionByTask = {}
    mockState.sessionStatusBySession = {}
    mockState.autoPilotByTask = {}
    ;(window as unknown as { api: unknown }).api = { fs: { readDir } }
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
    vi.clearAllMocks()
  })

  it('reads the design directory on the workspace host, passing its connectionId', async () => {
    const { result } = renderHook(() => useDesignDocFiles(mkItem(), true))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(readDir).toHaveBeenCalledWith({
      dirPath: '/remote/repo/.orca/design/ORCA-12',
      connectionId: 'ssh-1'
    })
    expect(result.current.connectionId).toBe('ssh-1')
    expect(result.current.dirPath).toBe('/remote/repo/.orca/design/ORCA-12')
  })

  it('treats a failed read as an empty document list', async () => {
    readDir.mockRejectedValue(new Error('ENOENT'))

    const { result } = renderHook(() => useDesignDocFiles(mkItem(), true))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.names).toEqual([])
  })

  it('keeps only the markdown entries', async () => {
    readDir.mockResolvedValue([
      { name: 'sub', isDirectory: true, isSymlink: false },
      { name: 'overview.md', isDirectory: false, isSymlink: false },
      { name: 'notes.txt', isDirectory: false, isSymlink: false }
    ])

    const { result } = renderHook(() => useDesignDocFiles(mkItem(), true))

    await waitFor(() => expect(result.current.names).toEqual(['overview.md']))
  })

  it('picks up documents written after the first read when refreshed', async () => {
    const { result } = renderHook(() => useDesignDocFiles(mkItem(), true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.names).toEqual([])

    readDir.mockResolvedValue([{ name: 'design.md', isDirectory: false, isSymlink: false }])
    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.names).toEqual(['design.md']))
    expect(readDir).toHaveBeenCalledTimes(2)
  })

  // Why: the design stage always runs under AutoPilot, so session status alone only moves at
  // run start and run end — documents written on turn 2 of 10 would stay invisible for the
  // rest of the run.
  it('re-lists the directory on every AutoPilot turn, not just at run start and end', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.sessionStatusBySession = { s1: 'running' }
    mockState.autoPilotByTask = { t1: { turn: 1, maxTurns: 10 } }
    const { result, rerender } = renderHook((item: TodoItem) => useDesignDocFiles(item, true), {
      initialProps: mkItem()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(readDir).toHaveBeenCalledTimes(1)

    readDir.mockResolvedValue([{ name: 'design.md', isDirectory: false, isSymlink: false }])
    mockState.autoPilotByTask = { t1: { turn: 2, maxTurns: 10 } }
    rerender(mkItem())

    await waitFor(() => expect(result.current.names).toEqual(['design.md']))
    expect(readDir).toHaveBeenCalledTimes(2)
  })

  it('re-lists the directory when the design session reaches a turn boundary', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.sessionStatusBySession = { s1: 'running' }
    const { result, rerender } = renderHook((item: TodoItem) => useDesignDocFiles(item, true), {
      initialProps: mkItem()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(readDir).toHaveBeenCalledTimes(1)

    readDir.mockResolvedValue([{ name: 'design.md', isDirectory: false, isSymlink: false }])
    mockState.sessionStatusBySession = { s1: 'complete' }
    rerender(mkItem())

    await waitFor(() => expect(result.current.names).toEqual(['design.md']))
    expect(readDir).toHaveBeenCalledTimes(2)
  })

  it('leaves the list alone on re-renders that are not a turn boundary', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.sessionStatusBySession = { s1: 'running' }
    const { result, rerender } = renderHook((item: TodoItem) => useDesignDocFiles(item, true), {
      initialProps: mkItem()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      rerender(mkItem())
    })

    expect(readDir).toHaveBeenCalledTimes(1)
  })

  // Why: the caller hoists this hook above the stage switch, so a disabled read is the
  // common case — and on an SSH workspace an eager one is a round-trip per turn boundary.
  it('does not touch the host while the caller has it disabled', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.sessionStatusBySession = { s1: 'running' }
    const { result, rerender } = renderHook((item: TodoItem) => useDesignDocFiles(item, false), {
      initialProps: mkItem({ status: 'in_progress' })
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    mockState.sessionStatusBySession = { s1: 'complete' }
    await act(async () => {
      rerender(mkItem({ status: 'in_progress' }))
    })

    expect(readDir).not.toHaveBeenCalled()
    expect(result.current.names).toEqual([])
  })

  it('drops a slow read that lands after the card path changed', async () => {
    let resolveFirst: (entries: unknown[]) => void = () => {}
    readDir
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValue([{ name: 'second.md', isDirectory: false, isSymlink: false }])

    const { result, rerender } = renderHook((item: TodoItem) => useDesignDocFiles(item, true), {
      initialProps: mkItem({ identifier: 'ORCA-12' })
    })
    rerender(mkItem({ identifier: 'ORCA-99' }))
    await waitFor(() => expect(result.current.names).toEqual(['second.md']))

    await act(async () => {
      resolveFirst([{ name: 'first.md', isDirectory: false, isSymlink: false }])
    })

    expect(result.current.names).toEqual(['second.md'])
  })
})
