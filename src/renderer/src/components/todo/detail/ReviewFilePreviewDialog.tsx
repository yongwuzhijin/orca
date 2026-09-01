import { ExternalLink, Loader2, Maximize2, Minimize2, X } from 'lucide-react'
import React, { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { detectLanguage } from '@/lib/language-detect'
import { useAppStore } from '@/store'
import type { ReviewFilePreviewTarget } from './review-file-preview-context'

const EditorPanel = React.lazy(() => import('@/components/editor/EditorPanel'))

export type ReviewFilePreviewState = ReviewFilePreviewTarget & {
  worktreeId: string
  connectionId?: string
}

type ReviewFilePreviewDialogProps = {
  preview: ReviewFilePreviewState | null
  onClose: () => void
}

function ReviewFilePreviewEditor({ editorFileId }: { editorFileId: string }): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {translate(
            'auto.components.todo.detail.ReviewFilePreviewDialog.loadingEditor',
            'Loading editor…'
          )}
        </div>
      }
    >
      <EditorPanel
        activeFileId={editorFileId}
        activeViewStateId={editorFileId}
        isVisible
        isCmdSaveOwner={false}
        markdownAnnotationsEnabled={false}
      />
    </Suspense>
  )
}

export function ReviewFilePreviewDialog({
  preview,
  onClose
}: ReviewFilePreviewDialogProps): React.JSX.Element {
  const openFile = useAppStore((s) => s.openFile)
  const closeFile = useAppStore((s) => s.closeFile)
  const makePreviewFilePermanent = useAppStore((s) => s.makePreviewFilePermanent)
  const [editorFileId, setEditorFileId] = React.useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const closePreviewOnUnmountRef = React.useRef(false)
  const openedFileIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!preview) {
      setEditorFileId(null)
      setIsFullscreen(false)
      return
    }
    const language = detectLanguage(preview.fileName)
    const fileId = openFile(
      {
        filePath: preview.filePath,
        relativePath: preview.relativePath,
        worktreeId: preview.worktreeId,
        language,
        mode: 'edit'
      },
      { preview: true, focusEditor: false }
    )
    const opened = useAppStore.getState().openFiles.find((file) => file.id === fileId)
    closePreviewOnUnmountRef.current = opened?.isPreview === true
    openedFileIdRef.current = fileId
    setEditorFileId(fileId)

    return () => {
      if (!closePreviewOnUnmountRef.current || openedFileIdRef.current !== fileId) {
        return
      }
      const stillPreview = useAppStore
        .getState()
        .openFiles.find((file) => file.id === fileId)?.isPreview
      if (stillPreview) {
        closeFile(fileId)
      }
    }
  }, [closeFile, openFile, preview])

  const handleOpenInEditor = React.useCallback(() => {
    if (!preview || !editorFileId) {
      onClose()
      return
    }
    closePreviewOnUnmountRef.current = false
    makePreviewFilePermanent(editorFileId)
    openFile(
      {
        filePath: preview.filePath,
        relativePath: preview.relativePath,
        worktreeId: preview.worktreeId,
        language: detectLanguage(preview.fileName),
        mode: 'edit'
      },
      { focusEditor: true }
    )
    onClose()
  }, [editorFileId, makePreviewFilePermanent, onClose, openFile, preview])

  const handleClose = React.useCallback(() => {
    onClose()
  }, [onClose])

  const toggleFullscreen = React.useCallback(() => {
    setIsFullscreen((current) => !current)
  }, [])

  return (
    <Dialog open={preview !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          isFullscreen
            ? 'inset-0 h-screen max-h-none w-screen max-w-none translate-none rounded-none sm:max-w-none'
            : 'h-[min(80vh,720px)] max-h-[calc(100vh-3rem)] sm:max-w-4xl'
        )}
      >
        {preview ? (
          <>
            <DialogTitle className="sr-only">{preview.fileName}</DialogTitle>
            <DialogDescription className="sr-only">
              {translate(
                'auto.components.todo.detail.ReviewFilePreviewDialog.description',
                'File preview'
              )}
            </DialogDescription>
            <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border bg-background/95 px-2 py-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={toggleFullscreen}
                aria-label={
                  isFullscreen
                    ? translate(
                        'auto.components.todo.detail.ReviewFilePreviewDialog.exitFullscreen',
                        'Exit full screen'
                      )
                    : translate(
                        'auto.components.todo.detail.ReviewFilePreviewDialog.fullscreen',
                        'Full screen'
                      )
                }
              >
                {isFullscreen ? (
                  <Minimize2 className="size-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="size-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleClose}
                aria-label={translate(
                  'auto.components.todo.detail.ReviewFilePreviewDialog.close',
                  'Close'
                )}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {editorFileId ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ReviewFilePreviewEditor editorFileId={editorFileId} />
              </div>
            ) : null}
            <DialogFooter className="shrink-0 gap-2 border-t border-border px-4 py-3 sm:justify-end">
              <Button onClick={handleOpenInEditor} disabled={!editorFileId}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {translate(
                  'auto.components.todo.detail.ReviewFilePreviewDialog.openInEditor',
                  'Open in workspace editor'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
