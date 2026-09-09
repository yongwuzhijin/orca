import React from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { useRepoById } from '@/store/selectors'
import { joinRequirementPrdPath } from '../../../../../shared/todo/todo-requirement-worktree-paths'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { ReviewFilePane } from './ReviewFilePane'
import { ReviewFilePreviewDialog, type ReviewFilePreviewState } from './ReviewFilePreviewDialog'
import {
  ReviewFilePreviewProvider,
  type ReviewFilePreviewTarget
} from './review-file-preview-context'
import { RequirementPrdPreview } from './RequirementPrdPreview'
import { useRequirementWorktreeId } from './use-requirement-worktree-id'

type RequirementPrdPaneProps = {
  item: TodoItem
}

export function RequirementPrdPane({ item }: RequirementPrdPaneProps): React.JSX.Element {
  const worktreeId = useRequirementWorktreeId(item)
  const worktree = useAppStore((s) =>
    worktreeId
      ? (s.getKnownWorktreeById(worktreeId, s.activeWorkspaceExecutionHostId ?? undefined) ?? null)
      : null
  )
  const activeRepo = useRepoById(worktree?.repoId ?? null)
  const [preview, setPreview] = React.useState<ReviewFilePreviewState | null>(null)
  const previewRefreshRef = React.useRef<(() => void) | null>(null)

  const openPrdEditor = React.useCallback(() => {
    if (!worktreeId || !worktree) {
      return
    }
    const filePath = joinRequirementPrdPath(worktree.path)
    setPreview({
      filePath,
      relativePath: '.dmonwork_worktree/prd.md',
      fileName: 'prd.md',
      worktreeId,
      connectionId: activeRepo?.connectionId ?? undefined
    })
  }, [activeRepo?.connectionId, worktree, worktreeId])

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

  if (!worktreeId || !worktree) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.todo.detail.RequirementPrdPane.noWorktree',
          'Workspace is not ready yet.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => previewRefreshRef.current?.()}
          aria-label={translate(
            'auto.components.todo.detail.RequirementPrdPane.refreshPreview',
            'Refresh PRD preview'
          )}
        >
          <RefreshCw className="size-3.5" />
          {translate(
            'auto.components.todo.detail.RequirementPrdPane.refreshPreview',
            'Refresh preview'
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={openPrdEditor}>
          {translate('auto.components.todo.detail.RequirementPrdPane.openPrd', 'Edit prd.md')}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <div className="min-h-0 overflow-hidden rounded-md border border-border">
          <RequirementPrdPreview
            worktreePath={worktree.path}
            worktreeId={worktreeId}
            connectionId={activeRepo?.connectionId ?? undefined}
            onRefreshReady={(refresh) => {
              previewRefreshRef.current = refresh
            }}
          />
        </div>
        <div className="min-h-0 overflow-hidden rounded-md border border-border">
          <ReviewFilePreviewProvider onFileActivate={handleFileActivate}>
            <ReviewFilePane />
          </ReviewFilePreviewProvider>
        </div>
      </div>
      <ReviewFilePreviewDialog
        preview={preview}
        onClose={() => {
          setPreview(null)
          previewRefreshRef.current?.()
        }}
      />
    </div>
  )
}
