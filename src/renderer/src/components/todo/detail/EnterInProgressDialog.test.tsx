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
  settings: null as { todoDesignStageSkill: string } | null,
  worktreesByRepo: {} as Record<string, unknown[]>,
  sshTargetLabels: new Map(),
  sshConnectionStates: new Map(),
  runtimeEnvironments: [],
  runtimeStatusByEnvironmentId: new Map(),
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

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { EnterInProgressDialog, buildBasePrompt, composePrompt } =
  await import('./EnterInProgressDialog')

afterEach(() => {
  cleanup()
  mockState.todoProjects[0].defaultWorkingDir = '/repo'
  mockState.settings = null
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
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
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
  it('enables start when the create-time project has a ready cwd', () => {
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled()
  })

  it('falls back to the todo project default working dir when no workspace project', () => {
    renderDialog(mkItem({ workspaceProjectId: null }))
    expect(screen.getByRole('button', { name: /start/i })).toBeEnabled()
  })

  it('disables confirm when no cwd can be resolved', () => {
    mockState.todoProjects[0].defaultWorkingDir = null
    renderDialog(mkItem({ workspaceProjectId: null }))
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
  })

  it('defaults engine from preferredAgent', () => {
    renderDialog(mkItem({ preferredAgent: 'cursor' }))
    expect(screen.getByLabelText(/engine/i)).toHaveValue('cursor')
  })

  it('passes autoPilot with default maxTurns when the toggle is on', async () => {
    renderDialog(mkItem({ workspaceProjectId: 'wp-1' }))
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ autoPilot: { maxTurns: 10 } })
    )
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
    // Deliberately not DEFAULT_TODO_DESIGN_STAGE_SKILL, so a hardcoded default cannot pass.
    mockState.settings = { todoDesignStageSkill: '/design-skill' }
    renderDialog(item)
    await userEvent.click(screen.getByLabelText(/design the solution first/i))
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith('t1', {
      status: 'solution_design',
      designStageEnabled: true
    })
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: buildDesignStagePrompt(item, '/design-skill')
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
    expect(mockState.updateTodoItem).toHaveBeenCalledWith('t1', {
      status: 'in_progress',
      designStageEnabled: false
    })
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
    expect(mockState.updateTodoItem).toHaveBeenCalledWith('t1', {
      status: 'in_progress',
      designStageEnabled: false
    })
  })

  it('hands off to implementation with the design docs in from-design mode', async () => {
    const item = mkItem({ workspaceProjectId: 'wp-1', designStageEnabled: true })
    renderDialog(item, { mode: 'from-design', designDocNames: ['plan.md'] })
    expect(screen.queryByLabelText(/design the solution first/i)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    expect(mockState.updateTodoItem).toHaveBeenCalledWith('t1', {
      status: 'in_progress',
      designStageEnabled: false
    })
    expect(mockState.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: buildDesignHandoffPrompt(item, ['plan.md']) })
    )
  })
})
