import React from 'react'
import { useAppStore } from '@/store'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { resolveWorkspaceOrcaDirName } from '../../../../../shared/orca-dir-names'
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

// `enabled` is the caller's answer to "am I showing these docs yet?" — the hook is hoisted
// above the stage switch, and on an SSH workspace an eager read costs a round-trip per turn.
export function useDesignDocFiles(item: TodoItem, enabled: boolean): DesignDocFiles {
  const project = useAppStore((s) => s.todoProjects.find((p) => p.id === item.projectId))
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const orcaDirName = useAppStore((s) => resolveWorkspaceOrcaDirName(s.settings))
  // Why: documents land at turn boundaries, and the read may cross SSH — so re-list per turn
  // rather than per streamed event, the chatter the spec rejected an fs watcher over. Session
  // status alone only moves at run start and end; the AutoPilot turn covers mid-run writes.
  const sessionTurnKey = useAppStore((s) => {
    const sessionId = s.activeSessionByTask[item.id]
    if (!sessionId) {
      return ''
    }
    const status = s.sessionStatusBySession[sessionId] ?? ''
    return `${sessionId}:${status}:${s.autoPilotByTask[item.id]?.turn ?? ''}`
  })
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
  const dirPath = enabled && cwd ? designDocDirAbsolutePath(cwd, orcaDirName, item.identifier) : ''

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
  }, [dirPath, connectionId, nonce, sessionTurnKey])

  const refresh = React.useCallback(() => setNonce((n) => n + 1), [])

  return { dirPath, connectionId, names, loading, refresh }
}
