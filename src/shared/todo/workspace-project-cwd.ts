import type { ProjectHostSetup } from '../types'

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
