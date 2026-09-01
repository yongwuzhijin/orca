import type { ProjectHostSetup } from '../project-types'

export type TodoStartRepoResolution = {
  repoId: string
  projectPath: string
  kind?: ProjectHostSetup['kind']
}

export function resolveTodoStartRepo(args: {
  workspaceProjectId: string | null
  projectHostSetups: readonly ProjectHostSetup[]
}): TodoStartRepoResolution | null {
  const projectId = args.workspaceProjectId?.trim()
  if (!projectId) {
    return null
  }
  const setup = args.projectHostSetups.find(
    (entry) =>
      entry.projectId === projectId && entry.setupState === 'ready' && entry.path.trim().length > 0
  )
  if (!setup) {
    return null
  }
  return {
    repoId: setup.repoId,
    projectPath: setup.path,
    ...(setup.kind ? { kind: setup.kind } : {})
  }
}
