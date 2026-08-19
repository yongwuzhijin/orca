import { useState } from 'react'
import type { BrowserQuickLink, BrowserQuickLinkFolder } from '../../../../shared/browser-workspace-types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { normalizeBookmarkUrlInput } from '@/lib/browser-bookmark-links'
import { translate } from '@/i18n/i18n'

// Why: Radix Select forbids empty item values, so root membership uses a sentinel.
const ROOT_FOLDER_VALUE = 'quick-links-root'

export function BrowserQuickLinkDialog({
  mode,
  link,
  folders,
  onOpenChange,
  onSave
}: {
  mode: 'add' | 'edit'
  link: BrowserQuickLink | null
  folders: BrowserQuickLinkFolder[]
  onOpenChange: (open: boolean) => void
  onSave: (title: string, url: string, folderId: string | null) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(link?.title ?? '')
  const [url, setUrl] = useState(link?.url ?? '')
  const [folderValue, setFolderValue] = useState(link?.folderId ?? ROOT_FOLDER_VALUE)
  const [urlError, setUrlError] = useState(false)

  const handleSave = (): void => {
    const normalizedUrl = normalizeBookmarkUrlInput(url)
    if (!normalizedUrl) {
      setUrlError(true)
      return
    }
    onSave(title, normalizedUrl, folderValue === ROOT_FOLDER_VALUE ? null : folderValue)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit'
              ? translate(
                  'auto.components.settings.BrowserQuickLinksPane.editLinkTitle',
                  'Edit Quick Link'
                )
              : translate(
                  'auto.components.settings.BrowserQuickLinksPane.addLinkTitle',
                  'Add Quick Link'
                )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-link-title">
              {translate('auto.components.settings.BrowserQuickLinksPane.nameLabel', 'Name')}
            </Label>
            <Input
              id="quick-link-title"
              value={title}
              autoFocus
              placeholder={translate(
                'auto.components.settings.BrowserQuickLinksPane.namePlaceholder',
                'Optional — defaults to the site host'
              )}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="quick-link-url">
              {translate('auto.components.settings.BrowserQuickLinksPane.urlLabel', 'URL')}
            </Label>
            <Input
              id="quick-link-url"
              value={url}
              placeholder={translate(
                'auto.components.settings.BrowserQuickLinksPane.urlPlaceholder',
                'https://example.com'
              )}
              aria-invalid={urlError}
              onChange={(event) => {
                setUrl(event.target.value)
                setUrlError(false)
              }}
              onKeyDown={(event) => event.key === 'Enter' && handleSave()}
            />
            {urlError ? (
              <p className="text-xs text-destructive">
                {translate(
                  'auto.components.settings.BrowserQuickLinksPane.invalidUrl',
                  'Enter a valid URL.'
                )}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label>
              {translate('auto.components.settings.BrowserQuickLinksPane.folderLabel', 'Folder')}
            </Label>
            <Select value={folderValue} onValueChange={setFolderValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROOT_FOLDER_VALUE}>
                  {translate(
                    'auto.components.settings.BrowserQuickLinksPane.rootFolder',
                    'Root (no folder)'
                  )}
                </SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {translate('auto.components.settings.BrowserQuickLinksPane.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave}>
            {translate('auto.components.settings.BrowserQuickLinksPane.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BrowserQuickLinkFolderDialog({
  mode,
  folder,
  onOpenChange,
  onSave
}: {
  mode: 'add' | 'rename'
  folder: BrowserQuickLinkFolder | null
  onOpenChange: (open: boolean) => void
  onSave: (name: string) => void
}): React.JSX.Element {
  const [name, setName] = useState(folder?.name ?? '')

  const handleSave = (): void => {
    if (!name.trim()) {
      return
    }
    onSave(name)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === 'rename'
              ? translate(
                  'auto.components.settings.BrowserQuickLinksPane.renameFolderTitle',
                  'Rename Folder'
                )
              : translate(
                  'auto.components.settings.BrowserQuickLinksPane.newFolderTitle',
                  'New Folder'
                )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="quick-link-folder-name">
            {translate('auto.components.settings.BrowserQuickLinksPane.folderNameLabel', 'Name')}
          </Label>
          <Input
            id="quick-link-folder-name"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSave()}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {translate('auto.components.settings.BrowserQuickLinksPane.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {translate('auto.components.settings.BrowserQuickLinksPane.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
