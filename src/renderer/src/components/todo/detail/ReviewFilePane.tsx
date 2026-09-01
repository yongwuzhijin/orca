import React from 'react'
import FileExplorer from '@/components/right-sidebar/FileExplorer'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { ReviewFilePreviewDialog, type ReviewFilePreviewState } from './ReviewFilePreviewDialog'
import {
  ReviewFilePreviewProvider,
  type ReviewFilePreviewTarget
} from './review-file-preview-context'
import { useReviewEmbeddedWorktreeId } from './review-embedded-worktree-context'

export function ReviewFilePane(): React.JSX.Element {
  const worktreeId = useReviewEmbeddedWorktreeId()
  const worktree = useAppStore((s) =>
    worktreeId
      ? (s.getKnownWorktreeById(worktreeId, s.activeWorkspaceExecutionHostId ?? undefined) ?? null)
      : null
  )
  const activeRepo = useRepoById(worktree?.repoId ?? null)
  const [preview, setPreview] = React.useState<ReviewFilePreviewState | null>(null)

  const handleFileActivate = React.useCallback(
    (target: ReviewFilePreviewTarget) => {
      if (!worktreeId) {
        return
      }
      setPreview({
        ...target,
        worktreeId,
        connectionId: activeRepo?.connectionId ?? undefined
      })
    },
    [activeRepo?.connectionId, worktreeId]
  )

  return (
    <ReviewFilePreviewProvider onFileActivate={handleFileActivate}>
      <FileExplorer />
      <ReviewFilePreviewDialog preview={preview} onClose={() => setPreview(null)} />
    </ReviewFilePreviewProvider>
  )
}
