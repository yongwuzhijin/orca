import React from 'react'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import { translate } from '@/i18n/i18n'
import { useRequirementPrdPreview } from './use-requirement-prd-preview'

type RequirementPrdPreviewProps = {
  worktreePath: string
  worktreeId: string
  connectionId?: string
  onRefreshReady?: (refresh: () => void) => void
}

export function RequirementPrdPreview({
  worktreePath,
  worktreeId,
  connectionId,
  onRefreshReady
}: RequirementPrdPreviewProps): React.JSX.Element {
  const preview = useRequirementPrdPreview({ worktreePath, connectionId })

  React.useEffect(() => {
    onRefreshReady?.(preview.refresh)
  }, [onRefreshReady, preview.refresh])

  if (preview.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate('auto.components.todo.detail.RequirementPrdPreview.loading', 'Loading PRD…')}
      </div>
    )
  }

  if (preview.error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {preview.error}
      </div>
    )
  }

  if (!preview.content.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.todo.detail.RequirementPrdPreview.empty',
          'No PRD content yet. Edit prd.md or run PRD parsing.'
        )}
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto scrollbar-sleek px-1">
      <MarkdownPreview
        content={preview.content}
        filePath={preview.filePath}
        scrollCacheKey={`requirement-prd:${worktreeId}`}
      />
    </div>
  )
}
