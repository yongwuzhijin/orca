// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

const mockState = {
  updateTodoItem: vi.fn().mockResolvedValue(undefined),
  executeTask: vi.fn().mockResolvedValue('s1'),
  openTodoDetail: vi.fn(),
  todoProjects: [
    {
      id: 'p1',
      name: 'P',
      identifierPrefix: 'P',
      nextSequence: 1,
      createdAt: '',
      updatedAt: '',
      defaultWorkingDir: '/repo'
    }
  ]
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: typeof mockState) => unknown) => selector(mockState)
}))

const { EnterInProgressDialog, buildBasePrompt, composePrompt } =
  await import('./EnterInProgressDialog')

afterEach(cleanup)

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
    ...overrides
  }
}

describe('prompt builders', () => {
  it('buildBasePrompt joins title and description', () => {
    expect(buildBasePrompt(mkItem())).toBe('Ship feature\n\nthe body')
  })
  it('composePrompt appends extra when present', () => {
    expect(composePrompt('base', '  more  ')).toBe('base\n\nmore')
    expect(composePrompt('base', '   ')).toBe('base')
  })
})

describe('EnterInProgressDialog', () => {
  it('prefills cwd from the project default working dir', () => {
    render(<EnterInProgressDialog item={mkItem()} onClose={vi.fn()} />)
    expect(screen.getByLabelText(/working directory/i)).toHaveValue('/repo')
  })

  it('disables confirm when cwd is empty', () => {
    const projectNoDir = { ...mockState.todoProjects[0], defaultWorkingDir: null }
    mockState.todoProjects = [projectNoDir]
    render(<EnterInProgressDialog item={mkItem()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled()
  })
})
