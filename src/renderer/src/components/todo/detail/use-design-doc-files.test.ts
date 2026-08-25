// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const readDir = vi.fn()

const mockState = {
  todoProjects: [{ id: 'p1', defaultWorkingDir: '/local/fallback' }],
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
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    designStageEnabled: true,
    ...overrides
  }
}

describe('useDesignDocFiles', () => {
  beforeEach(() => {
    readDir.mockResolvedValue([])
    ;(window as unknown as { api: unknown }).api = { fs: { readDir } }
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
    vi.clearAllMocks()
  })

  it('reads the design directory on the workspace host, passing its connectionId', async () => {
    const { result } = renderHook(() => useDesignDocFiles(mkItem()))

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

    const { result } = renderHook(() => useDesignDocFiles(mkItem()))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.names).toEqual([])
  })

  it('keeps only the markdown entries', async () => {
    readDir.mockResolvedValue([
      { name: 'sub', isDirectory: true, isSymlink: false },
      { name: 'overview.md', isDirectory: false, isSymlink: false },
      { name: 'notes.txt', isDirectory: false, isSymlink: false }
    ])

    const { result } = renderHook(() => useDesignDocFiles(mkItem()))

    await waitFor(() => expect(result.current.names).toEqual(['overview.md']))
  })
})
