import { describe, it, expect, vi } from 'vitest'
import { scanReviewPortsForTask } from './review-port-scan'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type { WorkspacePort, WorkspacePortScanResult } from '../../shared/workspace-ports'

function rec(overrides: Partial<AcpSessionRecord> = {}): AcpSessionRecord {
  return {
    id: 's1',
    taskId: 't1',
    engine: 'claude',
    sessionId: 'sess1',
    cwd: '/repo/app',
    status: 'completed',
    stopReason: null,
    startedAt: '',
    endedAt: null,
    createdAt: '2026-07-12T00:00:00.000Z',
    ...overrides
  }
}

function scanResult(ports: WorkspacePort[]): WorkspacePortScanResult {
  return { platform: 'darwin', scannedAt: 0, ports }
}

describe('scanReviewPortsForTask', () => {
  it('returns [] when the task has no sessions', async () => {
    const scan = vi.fn()
    const out = await scanReviewPortsForTask({ listByTask: () => [], scan }, 't1')
    expect(out).toEqual([])
    expect(scan).not.toHaveBeenCalled()
  })

  it('builds a probe from the latest session cwd and returns scanned ports', async () => {
    const port: WorkspacePort = {
      id: 'p1',
      bindHost: '0.0.0.0',
      connectHost: 'localhost',
      port: 5173,
      protocol: 'http',
      kind: 'workspace',
      owner: {
        worktreeId: 't1',
        repoId: 't1',
        displayName: 't1',
        path: '/repo/app',
        confidence: 'cwd'
      }
    }
    const scan = vi.fn().mockResolvedValue(scanResult([port]))
    const out = await scanReviewPortsForTask(
      { listByTask: () => [rec({ cwd: '/repo/app' })], scan },
      't1'
    )
    expect(scan).toHaveBeenCalledWith([
      { id: 't1', repoId: 't1', displayName: 't1', path: '/repo/app' }
    ])
    expect(out).toEqual([port])
  })
})
