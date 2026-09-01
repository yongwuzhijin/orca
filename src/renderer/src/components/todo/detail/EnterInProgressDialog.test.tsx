// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import {
  buildDesignHandoffPrompt,
  buildDesignStagePrompt
} from '../../../../../shared/todo/todo-design-prompt'

const startTodoWorkspace = vi.fn()

vi.mock('./todo-start-workspace', () => ({
  startTodoWorkspace: (...args: unknown[]) => startTodoWorkspace(...args)
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() }
}))

const mockState = {
  updateTodoItem: vi.fn().mockResolvedValue(undefined),
  executeTask: vi.fn().mockResolvedValue('s1'),
  openTodoDetail: vi.fn(),
  addRepo: vi.fn(),
  repos: [] as unknown[],
  projects: [] as unknown[],
  projectGroups: [] as unknown[],
  projectHostSetups: [
    {
      id: 'setup-1',
      projectId: 'wp-1',
      hostId: 'local',
      repoId: 'repo-1',
      path: '/from-create',
      displayName: 'wp',
      setupState: 'ready' as const,
      setupMethod: 'imported-existing-folder' as const,
      createdAt: 1,
      updatedAt: 1
    }
  ],
  settings: null as {
    todoDesignStageSkill: string
    disabledTuiAgents?: string[]
    defaultTuiAgent?: string | null
  } | null,
  worktreesByRepo: {} as Record<string, unknown[]>,
  sshTargetLabels: new Map(),
  sshConnectionStates: new Map(),
  runtimeEnvironments: [],
  runtimeStatusByEnvironmentId: new Map(),
  disabledTuiAgents: [] as string[],
  todoTemplates: [] as { id: string; name: string; body: string }[],
  todoProjects: [
    {
      id: 'p1',
      name: 'P',
      identifierPrefix: 'P',
      nextSequence: 1,
      createdAt: '',
      updatedAt: '',
      defaultWorkingDir: '/repo' as string | null
    }
  ]
}

vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({
    detectedIds: ['claude', 'claude-agent-teams', 'codex', 'cursor', 'qoder'],
    isLoading: false,
    detectionFailed: false,
    isRefreshing: false,
    refresh: vi.fn()
  })
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { EnterInProgressDialog, buildBasePrompt, composePrompt } =
  await import('./EnterInProgressDialog')

afterEach(() => {
  cleanup()
  mockState.settings = null
  startTodoWorkspace.mockReset()
  startTodoWorkspace.mockResolvedValue({
    ok: true,
    worktreeId: 'wt-1',
    path: '/repo/feat',
    displayName: 'feat'
  })
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

function renderDialog(
  item: TodoItem = mkItem(),
  props: { mode?: 'todo' | 'from-design'; designDocNames?: readonly string[] } = {}
): void {
  render(
    <TooltipProvider>
      <EnterInProgressDialog item={item} onClose={vi.fn()} {...props} />
    </TooltipProvider>
  )
}

describe('prompt builders', () => {
  it('buildBasePrompt joins title and description', () => {
    expect(buildBasePrompt(mkItem())).toBe('Ship feature\n\nthe body')
  })

  it('buildBasePrompt does not duplicate when title and description match', () => {
    expect(buildBasePrompt(mkItem({ title: '生成CLAUDE.md', description: '生成CLAUDE.md' }))).toBe(
      '生成CLAUDE.md'
    )
  })

  it('buildBasePrompt uses title alone when description is blank', () => {
    expect(buildBasePrompt(mkItem({ title: 'Ship feature', description: '  ' }))).toBe(
      'Ship feature'
    )
  })

  it('composePrompt appends extra when present', () => {
    expect(composePrompt('base', '  more  ')).toBe('base\n\nmore')
    expect(composePrompt('base', '   ')).toBe('base')
  })
})

describe('EnterInProgressDialog', () => {
  it('enables start when a bound project is ready', () => {
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled()
  })

  it('disables start and shows hint when no bound project', () => {
    renderDialog(mkItem({ workspaceProjectId: null }))
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
    expect(screen.getByText(/bind a project on this requirement/i)).toBeInTheDocument()
  })

  it('does not render a working directory picker', () => {
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    expect(screen.queryByText(/working directory/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /browse/i })).toBeNull()
  })

  it('defaults ACP engine from preferredAgent when valid', () => {
    renderDialog(mkItem({ preferredAgent: 'cursor' }))
    expect(screen.getByLabelText(/agent/i)).toHaveValue('cursor')
  })

  it('creates workspace then executes with cwd from worktree', async () => {
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(startTodoWorkspace).toHaveBeenCalled()
    expect(mockState.updateTodoItem).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ boundWorktreeId: 'wt-1', status: 'in_progress' })
    )
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/repo/feat',
        autoPilot: { maxTurns: 10 }
      })
    )
  })

  it('does not execute when workspace creation fails', async () => {
    startTodoWorkspace.mockResolvedValue({
      ok: false,
      reason: 'create-failed',
      message: 'boom'
    })
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).not.toHaveBeenCalled()
    expect(mockState.executeTask).not.toHaveBeenCalled()
  })

  it('omits autoPilot when the toggle is off', async () => {
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    await userEvent.click(screen.getByLabelText(/autopilot/i))
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ autoPilot: undefined })
    )
  })
})

describe('EnterInProgressDialog design stage', () => {
  it('sends the card to solution_design with the design prompt when checked', async () => {
    const item = mkItem({ workspaceProjectId: 'wp-1' })
    mockState.settings = { todoDesignStageSkill: '/design-skill' }
    renderDialog(item)
    await userEvent.click(screen.getByLabelText(/design the solution first/i))
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'solution_design',
        boundWorktreeId: 'wt-1',
        designStageEnabled: true,
        executionMode: 'acp',
        preferredAgent: 'cursor'
      })
    )
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: buildDesignStagePrompt(item, '/design-skill', '.orca'),
        cwd: '/repo/feat'
      })
    )
  })

  it('seeds the checkbox from the card', () => {
    mockState.settings = { todoDesignStageSkill: '/design-skill' }
    renderDialog(mkItem({ workspaceProjectId: 'wp-1', designStageEnabled: true }))
    expect(screen.getByLabelText(/design the solution first/i)).toBeChecked()
  })

  it('starts implementation directly with the base prompt when unchecked', async () => {
    const item = mkItem({ workspaceProjectId: 'wp-1' })
    renderDialog(item)
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'in_progress',
        boundWorktreeId: 'wt-1',
        designStageEnabled: false,
        executionMode: 'acp'
      })
    )
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: buildBasePrompt(item) })
    )
  })

  it('disables the design stage when no skill is configured', async () => {
    mockState.settings = { todoDesignStageSkill: '' }
    renderDialog(mkItem({ workspaceProjectId: 'wp-1', designStageEnabled: true }))
    expect(screen.getByLabelText(/design the solution first/i)).toBeDisabled()
    expect(screen.getByLabelText(/design the solution first/i)).not.toBeChecked()
    expect(screen.getByText(/set a solution design skill in settings/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'in_progress',
        boundWorktreeId: 'wt-1',
        designStageEnabled: false,
        executionMode: 'acp'
      })
    )
  })

  it('disables the design stage when the configured skill is only whitespace', async () => {
    mockState.settings = { todoDesignStageSkill: '   ' }
    renderDialog(mkItem({ workspaceProjectId: 'wp-1', designStageEnabled: true }))
    expect(screen.getByLabelText(/design the solution first/i)).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'in_progress',
        boundWorktreeId: 'wt-1',
        designStageEnabled: false,
        executionMode: 'acp'
      })
    )
  })

  it('hands off to implementation with the design docs in from-design mode', async () => {
    const item = mkItem({ workspaceProjectId: 'wp-1', designStageEnabled: true })
    renderDialog(item, { mode: 'from-design', designDocNames: ['plan.md'] })
    expect(screen.queryByLabelText(/design the solution first/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        status: 'in_progress',
        executionMode: 'acp',
        boundWorktreeId: 'wt-1'
      })
    )
    expect(mockState.updateTodoItem).not.toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ designStageEnabled: false })
    )
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: buildDesignHandoffPrompt(item, ['plan.md'], '.orca') })
    )
  })
})
