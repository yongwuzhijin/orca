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
  autoPilotByTask: {} as Record<string, { turn: number; maxTurns: number } | null>,
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
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    ...overrides
  }
}

describe('InProgressPanel', () => {
  it('loads sessions on mount', () => {
    render(<InProgressPanel item={mkItem()} />)
    expect(mockState.loadSessions).toHaveBeenCalledWith('t1')
  })

  it('shows loading while the session and history are being restored', () => {
    mockState.activeSessionByTask = {}
    mockState.loadSessions.mockImplementationOnce(() => new Promise(() => {}))

    render(<InProgressPanel item={mkItem()} />)

    expect(screen.getByRole('status', { name: /restoring session/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument()
  })

  it('shows the launch entry when there is no active session', async () => {
    mockState.activeSessionByTask = {}
    render(<InProgressPanel item={mkItem()} />)
    expect(await screen.findByRole('button', { name: /start session/i })).toBeInTheDocument()
  })

  it('keeps the conversation pane width-bounded when the plan rail is hidden', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.activeSessionMetaByTask = { t1: { engine: 'claude', cwd: '/tmp' } }
    mockState.eventsBySession = { s1: [] }
    mockState.planBySession = { s1: [] }
    mockState.permissionRequestsBySession = { s1: [] }
    mockState.permissionModeBySession = { s1: 'auto' }
    mockState.sessionStatusBySession = { s1: 'complete' }
    mockState.loadSessions.mockResolvedValue(undefined)

    const { container } = render(<InProgressPanel item={mkItem()} showPlan={false} />)
    await screen.findByTestId('session-composer')

    expect(container.firstChild).toHaveClass('min-w-0')
    expect(screen.getByTestId('session-conversation')).toHaveClass('min-w-0', 'w-full')
    expect(screen.getByRole('button', { name: /send/i })).toBeVisible()
  })

  it('shows the AutoPilot turn badge and stop button while running', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.activeSessionMetaByTask = { t1: { engine: 'claude', cwd: '/tmp' } }
    mockState.eventsBySession = { s1: [] }
    mockState.planBySession = { s1: [] }
    mockState.permissionRequestsBySession = { s1: [] }
    mockState.permissionModeBySession = { s1: 'auto' }
    mockState.sessionStatusBySession = { s1: 'running' }
    mockState.autoPilotByTask = { t1: { turn: 2, maxTurns: 5 } }
    mockState.loadSessions.mockResolvedValue(undefined)

    render(<InProgressPanel item={mkItem()} showPlan={false} />)
    await screen.findByTestId('session-composer')

    expect(screen.getByText(/2\/5/)).toBeVisible()
    const stop = screen.getByRole('button', { name: /stop autopilot/i })
    stop.click()
    expect(mockState.cancelSession).toHaveBeenCalledWith('s1')
  })

  it('hides the AutoPilot badge once the session is no longer running', async () => {
    mockState.activeSessionByTask = { t1: 's1' }
    mockState.activeSessionMetaByTask = { t1: { engine: 'claude', cwd: '/tmp' } }
    mockState.eventsBySession = { s1: [] }
    mockState.planBySession = { s1: [] }
    mockState.permissionRequestsBySession = { s1: [] }
    mockState.permissionModeBySession = { s1: 'auto' }
    mockState.sessionStatusBySession = { s1: 'complete' }
    mockState.autoPilotByTask = { t1: { turn: 5, maxTurns: 5 } }
    mockState.loadSessions.mockResolvedValue(undefined)

    render(<InProgressPanel item={mkItem()} showPlan={false} />)
    await screen.findByTestId('session-composer')

    expect(screen.queryByRole('button', { name: /stop autopilot/i })).toBeNull()
  })
})
