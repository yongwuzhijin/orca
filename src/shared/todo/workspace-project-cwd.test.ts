import { describe, expect, it } from 'vitest'
import type { ProjectHostSetup } from '../project-types'
import { resolveWorkspaceProjectConnectionId } from './workspace-project-cwd'

function setup(overrides: Partial<ProjectHostSetup> = {}): ProjectHostSetup {
  return {
    projectId: 'p1',
    setupState: 'ready',
    path: '/remote/repo',
    connectionId: 'ssh-1',
    ...overrides
  } as ProjectHostSetup
}

describe('resolveWorkspaceProjectConnectionId', () => {
  it("returns the ready setup's connectionId", () => {
    expect(resolveWorkspaceProjectConnectionId('p1', [setup()])).toBe('ssh-1')
  })

  it('returns undefined for a local project', () => {
    expect(
      resolveWorkspaceProjectConnectionId('p1', [setup({ connectionId: null })])
    ).toBeUndefined()
  })

  it('ignores setups that are not ready', () => {
    expect(
      resolveWorkspaceProjectConnectionId('p1', [setup({ setupState: 'setting-up' })])
    ).toBeUndefined()
  })

  it('ignores setups belonging to another project', () => {
    expect(resolveWorkspaceProjectConnectionId('p1', [setup({ projectId: 'p2' })])).toBeUndefined()
  })

  it('returns undefined when the card has no workspace project', () => {
    expect(resolveWorkspaceProjectConnectionId(null, [setup()])).toBeUndefined()
  })
})
