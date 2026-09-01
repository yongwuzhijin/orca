import { describe, expect, it } from 'vitest'
import type { ProjectHostSetup } from '../project-types'
import { resolveTodoStartRepo } from './resolve-todo-start-repo'

function setup(overrides: Partial<ProjectHostSetup> = {}): ProjectHostSetup {
  return {
    id: 's1',
    projectId: 'p1',
    hostId: 'local',
    repoId: 'r1',
    path: '/repo',
    displayName: 'r',
    setupState: 'ready',
    setupMethod: 'imported-existing-folder',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('resolveTodoStartRepo', () => {
  it('returns null when no ready setup', () => {
    expect(resolveTodoStartRepo({ workspaceProjectId: 'p1', projectHostSetups: [] })).toBeNull()
  })

  it('returns null when workspaceProjectId missing', () => {
    expect(
      resolveTodoStartRepo({ workspaceProjectId: null, projectHostSetups: [setup()] })
    ).toBeNull()
  })

  it('returns repoId and path from ready setup', () => {
    expect(
      resolveTodoStartRepo({
        workspaceProjectId: 'p1',
        projectHostSetups: [setup()]
      })
    ).toEqual({ repoId: 'r1', projectPath: '/repo' })
  })

  it('skips non-ready or blank-path setups', () => {
    expect(
      resolveTodoStartRepo({
        workspaceProjectId: 'p1',
        projectHostSetups: [
          setup({ setupState: 'not-set-up' }),
          setup({ id: 's2', path: '  ' }),
          setup({ id: 's3', path: '/ok', repoId: 'r2' })
        ]
      })
    ).toEqual({ repoId: 'r2', projectPath: '/ok' })
  })
})
