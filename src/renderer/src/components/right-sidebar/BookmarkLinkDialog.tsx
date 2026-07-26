import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeBookmarkUrlInput } from '@/lib/browser-bookmark-links'
import { translate } from '@/i18n/i18n'

type BookmarkLinkDialogProps = {
  open: boolean
  heading: string
  description?: string
  initialTitle?: string
  initialUrl?: string
  onOpenChange: (open: boolean) => void
  onSave: (title: string, url: string) => void
}

export function BookmarkLinkDialog({
  open,
  heading,
  description,
  initialTitle,
  initialUrl,
  onOpenChange,
  onSave
}: BookmarkLinkDialogProps): React.JSX.Element {
  const [title, setTitle] = useState(initialTitle ?? '')
  const [url, setUrl] = useState(initialUrl ?? '')
  const [urlError, setUrlError] = useState(false)

  // Why: the dialog stays mounted across add/edit targets; re-seed fields per opening.
  useEffect(() => {
    if (open) {
      setTitle(initialTitle ?? '')
      setUrl(initialUrl ?? '')
      setUrlError(false)
    }
  }, [open, initialTitle, initialUrl])

  const handleSave = (): void => {
    const normalizedUrl = normalizeBookmarkUrlInput(url)
    if (!normalizedUrl) {
      setUrlError(true)
      return
    }
    onSave(title, normalizedUrl)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="bookmark-link-title">
              {translate('auto.components.right.sidebar.BookmarkLinkDialog.nameLabel', 'Name')}
            </Label>
            <Input
              id="bookmark-link-title"
              value={title}
              autoFocus
              placeholder={translate(
                'auto.components.right.sidebar.BookmarkLinkDialog.namePlaceholder',
                'Optional — defaults to the site host'
              )}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSave()
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="bookmark-link-url">
              {translate('auto.components.right.sidebar.BookmarkLinkDialog.urlLabel', 'URL')}
            </Label>
            <Input
              id="bookmark-link-url"
              value={url}
              placeholder={translate(
                'auto.components.right.sidebar.BookmarkLinkDialog.urlPlaceholder',
                'https://example.com/docs'
              )}
              aria-invalid={urlError}
              onChange={(event) => {
                setUrl(event.target.value)
                setUrlError(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSave()
                }
              }}
            />
            {urlError ? (
              <p className="text-xs text-destructive">
                {translate(
                  'auto.components.right.sidebar.BookmarkLinkDialog.invalidUrl',
                  'Enter a valid URL.'
                )}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {translate('auto.components.right.sidebar.BookmarkLinkDialog.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave}>
            {translate('auto.components.right.sidebar.BookmarkLinkDialog.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
