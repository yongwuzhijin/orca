// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const mockState = {
  activeSessionByTask: {} as Record<string, string | null>,
  activeSessionMetaByTask: {} as Record<string, { engine: string; cwd: string }>,
  eventsBySession: {} as Record<string, unknown[]>,
  planBySession: {} as Record<string, unknown[]>,
  permissionRequestsBySession: {} as Record<string, unknown[]>,
  permissionModeBySession: {} as Record<string, 'auto' | 'ask'>,
  sessionStatusBySession: {} as Record<string, string>,
  loadSessions: vi.fn().mockResolvedValue(undefined),
  sendFollowUp: vi.fn(),
  cancelSession: vi.fn(),
  setPermissionMode: vi.fn(),
  resolvePermission: vi.fn(),
  todoProjects: [] as unknown[]
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { InProgressPanel } = await import('./InProgressPanel')

afterEach(cleanup)

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Do it',
    description: '',
    status: 'in_progress',
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
    workspaceName: null,
    preferredAgent: null,
    ...overrides
  }
}

describe('InProgressPanel', () => {
  it('loads sessions on mount', () => {
    render(<InProgressPanel item={mkItem()} />)
    expect(mockState.loadSessions).toHaveBeenCalledWith('t1')
  })

  it('shows the launch entry when there is no active session', () => {
    mockState.activeSessionByTask = {}
    render(<InProgressPanel item={mkItem()} />)
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument()
  })
})
