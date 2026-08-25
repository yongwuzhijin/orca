import type { ProjectHostSetup } from '../project-types'

// Why: single lookup for both resolvers below, so a task's cwd and its execution host
// are always read off the same setup and cannot diverge.
function findReadySetup(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[]
): ProjectHostSetup | undefined {
  return projectHostSetups.find(
    (setup) => setup.projectId === workspaceProjectId && setup.setupState === 'ready'
  )
}

// Why: shared between the renderer Start dialog and the main-process orchestrator
// so both resolve a task's cwd identically (ready host setup path → fallback).
export function resolveWorkspaceProjectCwd(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[],
  fallbackCwd?: string | null
): string {
  // A ready setup with a blank path still falls through to the fallback.
  return findReadySetup(workspaceProjectId, projectHostSetups)?.path || (fallbackCwd?.trim() ?? '')
}

// Why: undefined means the workspace lives on this host, so callers read its files locally.
export function resolveWorkspaceProjectConnectionId(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[]
): string | undefined {
  return findReadySetup(workspaceProjectId, projectHostSetups)?.connectionId ?? undefined
}
