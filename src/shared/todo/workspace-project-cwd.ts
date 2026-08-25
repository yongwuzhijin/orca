import type { ProjectHostSetup } from '../project-types'

// Why: shared between the renderer Start dialog and the main-process orchestrator
// so both resolve a task's cwd identically (ready host setup path → fallback).
export function resolveWorkspaceProjectCwd(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[],
  fallbackCwd?: string | null
): string {
  if (workspaceProjectId) {
    const ready = projectHostSetups.find(
      (setup) => setup.projectId === workspaceProjectId && setup.setupState === 'ready'
    )
    if (ready?.path) {
      return ready.path
    }
  }
  return fallbackCwd?.trim() ?? ''
}

// Why: reads the same ready setup as resolveWorkspaceProjectCwd, so the host and the cwd can never diverge.
export function resolveWorkspaceProjectConnectionId(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[]
): string | undefined {
  if (!workspaceProjectId) {
    return undefined
  }
  const ready = projectHostSetups.find(
    (setup) => setup.projectId === workspaceProjectId && setup.setupState === 'ready'
  )
  return ready?.connectionId ?? undefined
}
