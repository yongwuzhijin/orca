import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type {
  WorkspacePort,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '../../shared/workspace-ports'

export type ReviewPortScanDeps = {
  listByTask: (taskId: string) => AcpSessionRecord[]
  scan: (probes: readonly WorkspacePortProbe[]) => Promise<WorkspacePortScanResult>
}

// Tasks run ACP in a cwd only (no worktreeId). Reuse path-based port attribution
// by turning the latest session's cwd into an ad-hoc probe.
export async function scanReviewPortsForTask(
  deps: ReviewPortScanDeps,
  taskId: string
): Promise<WorkspacePort[]> {
  const latest = deps.listByTask(taskId)[0]
  if (!latest || !latest.cwd) {
    return []
  }
  const probe: WorkspacePortProbe = {
    id: taskId,
    repoId: taskId,
    displayName: taskId,
    path: latest.cwd
  }
  const result = await deps.scan([probe])
  return result.ports
}
