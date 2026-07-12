import { describe, it, expect } from 'vitest'
import { portToPreviewUrl } from './review-port-url'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'

function workspacePort(overrides: Partial<WorkspacePort> = {}): WorkspacePort {
  return {
    id: 'p1',
    bindHost: '0.0.0.0',
    connectHost: 'localhost',
    port: 5173,
    protocol: 'http',
    kind: 'workspace',
    owner: { worktreeId: 't', repoId: 't', displayName: 't', path: '/x', confidence: 'cwd' },
    ...overrides
  } as WorkspacePort
}

describe('portToPreviewUrl', () => {
  it('prefers advertisedUrl when present on a workspace port', () => {
    const p = workspacePort({ advertisedUrl: 'https://localhost:5173/' } as Partial<WorkspacePort>)
    expect(portToPreviewUrl(p)).toBe('https://localhost:5173/')
  })

  it('falls back to protocol://connectHost:port', () => {
    expect(portToPreviewUrl(workspacePort())).toBe('http://localhost:5173')
  })

  it('uses https when protocol is https', () => {
    expect(portToPreviewUrl(workspacePort({ protocol: 'https', port: 8443 }))).toBe(
      'https://localhost:8443'
    )
  })
})
