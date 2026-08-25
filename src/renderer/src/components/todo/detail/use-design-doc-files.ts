import React from 'react'
import { useAppStore } from '@/store'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import {
  resolveWorkspaceProjectConnectionId,
  resolveWorkspaceProjectCwd
} from '../../../../../shared/todo/workspace-project-cwd'
import { designDocDirAbsolutePath, filterDesignDocNames } from './design-doc-files'

export type DesignDocFiles = {
  dirPath: string
  connectionId?: string
  names: string[]
  loading: boolean
  refresh: () => void
}

export function useDesignDocFiles(item: TodoItem): DesignDocFiles {
  const project = useAppStore((s) => s.todoProjects.find((p) => p.id === item.projectId))
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const [names, setNames] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [nonce, setNonce] = React.useState(0)

  const cwd = resolveWorkspaceProjectCwd(
    item.workspaceProjectId,
    projectHostSetups,
    project?.defaultWorkingDir
  )
  const connectionId = resolveWorkspaceProjectConnectionId(
    item.workspaceProjectId,
    projectHostSetups
  )
  const dirPath = cwd ? designDocDirAbsolutePath(cwd, item.identifier) : ''

  React.useEffect(() => {
    if (!dirPath) {
      setNames([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      // Why: the directory only exists once the design agent has written into it, so a
      // failed read is the normal pre-design state rather than something to surface.
      const next = await window.api.fs
        .readDir({ dirPath, connectionId })
        .then(filterDesignDocNames)
        .catch<string[]>(() => [])
      if (!cancelled) {
        setNames(next)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dirPath, connectionId, nonce])

  const refresh = React.useCallback(() => setNonce((n) => n + 1), [])

  return { dirPath, connectionId, names, loading, refresh }
}
