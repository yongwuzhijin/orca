import { describe, expect, it } from 'vitest'
import { resolveWorkspaceProjectCwd } from './TodoWorkspaceProjectPicker'
import type { ProjectHostSetup } from '../../../../shared/types'

function mkSetup(overrides: Partial<ProjectHostSetup> = {}): ProjectHostSetup {
  return {
    id: 'setup-1',
    projectId: 'proj-1',
    hostId: 'local',
    repoId: 'repo-1',
    path: '/Users/me/proj',
    displayName: 'proj',
    setupState: 'ready',
    setupMethod: 'imported-existing-folder',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('resolveWorkspaceProjectCwd', () => {
  it('returns the ready setup path for the selected project', () => {
    expect(resolveWorkspaceProjectCwd('proj-1', [mkSetup()], null)).toBe('/Users/me/proj')
  })

  it('falls back when no ready setup matches', () => {
    expect(
      resolveWorkspaceProjectCwd('proj-1', [mkSetup({ setupState: 'not-set-up' })], '/fallback')
    ).toBe('/fallback')
  })

  it('returns empty string when nothing is available', () => {
    expect(resolveWorkspaceProjectCwd(null, [], null)).toBe('')
  })
})
