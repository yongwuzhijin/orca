import { describe, expect, it, vi, beforeEach } from 'vitest'

const createWorktree = vi.fn()
const getKnownWorktreeById = vi.fn()
const mockState = {
  createWorktree,
  getKnownWorktreeById,
  activeWorkspaceExecutionHostId: null,
  projectHostSetups: [
    {
      id: 's1',
      projectId: 'proj-1',
      hostId: 'local',
      repoId: 'repo-1',
      path: '/repo',
      displayName: 'repo',
      setupState: 'ready' as const,
      setupMethod: 'imported-existing-folder' as const,
      createdAt: 1,
      updatedAt: 1
    }
  ],
  repos: [{ id: 'repo-1', kind: 'git' as const, name: 'repo', path: '/repo' }] as {
    id: string
    kind: 'git' | 'folder'
    name: string
    path: string
  }[]
}

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mockState
  }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const { startTodoWorkspace } = await import('./todo-start-workspace')

beforeEach(() => {
  createWorktree.mockReset()
  getKnownWorktreeById.mockReset()
  mockState.repos = [{ id: 'repo-1', kind: 'git' as const, name: 'repo', path: '/repo' }]
})

describe('startTodoWorkspace', () => {
  it('reuses boundWorktreeId when worktree is known', async () => {
    getKnownWorktreeById.mockReturnValue({
      id: 'wt-bound',
      path: '/repo/bound',
      displayName: 'bound',
      name: 'bound'
    })
    const result = await startTodoWorkspace({
      boundWorktreeId: 'wt-bound',
      workspaceProjectId: 'proj-1',
      title: 'Ship'
    } as never)
    expect(result).toEqual({
      ok: true,
      worktreeId: 'wt-bound',
      path: '/repo/bound',
      displayName: 'bound'
    })
    expect(createWorktree).not.toHaveBeenCalled()
  })

  it('returns no-project when workspaceProjectId is missing', async () => {
    const result = await startTodoWorkspace({
      workspaceProjectId: null,
      workspaceName: null,
      title: 'Ship'
    } as never)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'no-project' }))
    expect(createWorktree).not.toHaveBeenCalled()
  })

  it('returns unsupported-folder for folder repos', async () => {
    mockState.repos = [{ id: 'repo-1', kind: 'folder' as const, name: 'repo', path: '/repo' }]
    const result = await startTodoWorkspace({
      workspaceProjectId: 'proj-1',
      workspaceName: 'feat',
      title: 'Ship'
    } as never)
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: 'unsupported-folder' }))
  })

  it('creates a worktree and returns its id/path', async () => {
    createWorktree.mockResolvedValue({
      worktree: { id: 'wt-1', path: '/repo/feat', displayName: 'feat' }
    })
    const result = await startTodoWorkspace({
      workspaceProjectId: 'proj-1',
      workspaceName: 'feat',
      title: 'Ship'
    } as never)
    expect(createWorktree).toHaveBeenCalledWith(
      'repo-1',
      'feat',
      undefined,
      'skip',
      undefined,
      'unknown',
      'feat'
    )
    expect(result).toEqual({
      ok: true,
      worktreeId: 'wt-1',
      path: '/repo/feat',
      displayName: 'feat'
    })
  })
})
