// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { resolveTodoWorkspaceName } from '../../../../../shared/todo/todo-workspace-name'

const activateAndRevealWorktree = vi.fn()

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: (...args: unknown[]) => activateAndRevealWorktree(...args)
}))

const mockState = {
  projectHostSetups: [
    {
      id: 'setup-1',
      projectId: 'wp-1',
      hostId: 'local',
      repoId: 'repo-1',
      path: '/projects/orca',
      displayName: 'orca',
      setupState: 'ready' as const,
      setupMethod: 'imported-existing-folder' as const,
      createdAt: 1,
      updatedAt: 1
    }
  ],
  worktreesByRepo: {
    'repo-1': [
      {
        id: 'wt-1',
        path: '/projects/orca/feat-ship',
        displayName: 'feat-ship',
        branch: 'feat-ship'
      }
    ]
  } as Record<string, { id: string; path: string; displayName: string; branch?: string }[]>
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const { TodoDetailWorkspaceMeta } = await import('./TodoDetailWorkspaceMeta')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Ship feature',
    description: 'the body',
    status: 'todo',
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
    workspaceProjectId: null,
    workspaceProjectIds: [],
    workspaceName: null,
    prdLink: null,
    executionMode: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    boundWorktreeId: null,
    designStageEnabled: false,
    ...overrides
  }
}

describe('TodoDetailWorkspaceMeta', () => {
  it('shows unset workspace and unbound project when title and project are empty', () => {
    render(<TodoDetailWorkspaceMeta item={mkItem({ title: '' })} />)
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
    expect(screen.getByText('No project bound')).toBeInTheDocument()
  })

  it('previews workspace name from title when no workspaceName', () => {
    render(<TodoDetailWorkspaceMeta item={mkItem({ title: 'Ship feature' })} />)
    expect(
      screen.getByText(resolveTodoWorkspaceName({ workspaceName: null, title: 'Ship feature' }))
    ).toBeInTheDocument()
  })

  it('shows workspaceName and project path before worktree exists', () => {
    render(
      <TodoDetailWorkspaceMeta
        item={mkItem({ workspaceProjectId: 'wp-1', workspaceName: 'my-feat' })}
      />
    )
    expect(screen.getByText('my-feat')).toBeInTheDocument()
    expect(screen.getByText('/projects/orca')).toBeInTheDocument()
    expect(screen.queryByText('/projects/orca/feat-ship')).toBeNull()
  })

  it('shows bound worktree name and path after start', () => {
    render(
      <TodoDetailWorkspaceMeta
        item={mkItem({
          workspaceProjectId: 'wp-1',
          boundWorktreeId: 'wt-1',
          workspaceName: 'ignored'
        })}
      />
    )
    expect(screen.getByText('feat-ship')).toBeInTheDocument()
    expect(screen.getByText('/projects/orca')).toBeInTheDocument()
    expect(screen.getByText('/projects/orca/feat-ship')).toBeInTheDocument()
  })

  it('activates the worktree when the workspace path is clicked', async () => {
    render(
      <TodoDetailWorkspaceMeta
        item={mkItem({ workspaceProjectId: 'wp-1', boundWorktreeId: 'wt-1' })}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '/projects/orca/feat-ship' }))
    expect(activateAndRevealWorktree).toHaveBeenCalledWith('wt-1')
  })
})
