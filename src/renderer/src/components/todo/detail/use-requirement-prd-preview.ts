import React from 'react'
import { joinPath } from '@/lib/path'
import {
  joinRequirementPrdPath,
  joinRequirementWorktreeRoot
} from '../../../../../shared/todo/todo-requirement-worktree-paths'
import { prepareRequirementPrdPreviewContent } from '../../../../../shared/todo/requirement-prd-preview'

type UseRequirementPrdPreviewResult = {
  content: string
  filePath: string
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useRequirementPrdPreview(args: {
  worktreePath: string | null
  connectionId?: string
}): UseRequirementPrdPreviewResult {
  const [content, setContent] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)

  const filePath = args.worktreePath ? joinRequirementPrdPath(args.worktreePath) : ''

  React.useEffect(() => {
    if (!args.worktreePath) {
      setContent('')
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const prdResult = await window.api.fs.readFile({
          filePath,
          connectionId: args.connectionId
        })
        if (cancelled) {
          return
        }
        if (prdResult.isBinary) {
          setContent('')
          setError('PRD file is not readable text.')
          return
        }

        const assetsDir = joinPath(joinRequirementWorktreeRoot(args.worktreePath!), 'assets')
        let assetNames: string[] = []
        try {
          const entries = await window.api.fs.readDir({
            dirPath: assetsDir,
            connectionId: args.connectionId
          })
          assetNames = entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name)
        } catch {
          assetNames = []
        }

        const normalized = prepareRequirementPrdPreviewContent({
          worktreePath: args.worktreePath!,
          prdContent: prdResult.content,
          assetRelativePaths: assetNames.map((name) => `assets/${name}`)
        })
        setContent(normalized)
      } catch (readError) {
        if (!cancelled) {
          setContent('')
          setError(readError instanceof Error ? readError.message : 'Failed to load PRD preview.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [args.connectionId, args.worktreePath, filePath, refreshToken])

  return {
    content,
    filePath,
    loading,
    error,
    refresh: () => setRefreshToken((token) => token + 1)
  }
}
