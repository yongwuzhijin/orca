import { describe, expect, it } from 'vitest'
import type { TodoItem } from './todo-item'
import {
  listActiveBoundWorktreeIds,
  partitionRequirementWorktrees
} from './todo-requirement-worktrees'

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    id: 't1',
    identifier: 'P-1',
    projectId: 'p1',
    title: 'Ship',
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

describe('listActiveBoundWorktreeIds', () => {
  it('includes bound ids on non-terminal statuses', () => {
    expect(
      listActiveBoundWorktreeIds([
        mkItem({ id: 'a', boundWorktreeId: 'wt-1', status: 'in_progress' }),
        mkItem({ id: 'b', boundWorktreeId: 'wt-2', status: 'todo' }),
        mkItem({ id: 'c', boundWorktreeId: 'wt-3', status: 'done' }),
        mkItem({ id: 'd', boundWorktreeId: null, status: 'in_progress' })
      ])
    ).toEqual(new Set(['wt-1', 'wt-2']))
  })

  it('excludes canceled and duplicate', () => {
    expect(
      listActiveBoundWorktreeIds([
        mkItem({ boundWorktreeId: 'wt-c', status: 'canceled' }),
        mkItem({ boundWorktreeId: 'wt-d', status: 'duplicate' })
      ])
    ).toEqual(new Set())
  })
})

describe('partitionRequirementWorktrees', () => {
  it('splits bound worktrees to the front group', () => {
    expect(
      partitionRequirementWorktrees(
        [{ id: 'wt-a' }, { id: 'wt-b' }, { id: 'wt-c' }],
        new Set(['wt-b'])
      )
    ).toEqual({
      requirement: [{ id: 'wt-b' }],
      rest: [{ id: 'wt-a' }, { id: 'wt-c' }]
    })
  })

  it('returns all as rest when no active bounds', () => {
    expect(partitionRequirementWorktrees([{ id: 'wt-a' }], new Set())).toEqual({
      requirement: [],
      rest: [{ id: 'wt-a' }]
    })
  })
})
