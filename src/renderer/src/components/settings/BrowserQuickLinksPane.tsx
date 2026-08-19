import { useMemo, useState } from 'react'
import { Folder, FolderPlus, Globe, Pencil, Plus, Trash2 } from 'lucide-react'
import type {
  BrowserQuickLink,
  BrowserQuickLinkFolder
} from '../../../../shared/browser-workspace-types'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { buildBrowserBookmarkLink, createBrowserBookmarkLinkId } from '@/lib/browser-bookmark-links'
import { translate } from '@/i18n/i18n'
import { BrowserQuickLinkDialog, BrowserQuickLinkFolderDialog } from './BrowserQuickLinkDialogs'

type BrowserQuickLinksPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

type LinkEditorState = { mode: 'add' | 'edit'; link: BrowserQuickLink | null }
type FolderEditorState = { mode: 'add' | 'rename'; folder: BrowserQuickLinkFolder | null }

export function BrowserQuickLinksPane({
  settings,
  updateSettings
}: BrowserQuickLinksPaneProps): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const linksSource = settings.browserQuickLinks
  const links = useMemo(() => linksSource ?? [], [linksSource])
  const folders = settings.browserQuickLinkFolders ?? []

  const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null)
  const [folderEditor, setFolderEditor] = useState<FolderEditorState | null>(null)

  const rootLinks = links.filter((link) => !link.folderId)
  const linksByFolder = useMemo(() => {
    const byFolder = new Map<string, BrowserQuickLink[]>()
    for (const link of links) {
      if (!link.folderId) {
        continue
      }
      const bucket = byFolder.get(link.folderId) ?? []
      bucket.push(link)
      byFolder.set(link.folderId, bucket)
    }
    return byFolder
  }, [links])

  const saveLink = (title: string, url: string, folderId: string | null): void => {
    // Why: re-read from the store so save lands on the latest list when dialogs fire in quick succession.
    const latest = useAppStore.getState().settings?.browserQuickLinks ?? []
    const editing = linkEditor?.link
    const nextList = editing
      ? latest.map((entry) =>
          entry.id === editing.id
            ? { ...entry, title: title.trim() || entry.title, url, folderId }
            : entry
        )
      : [...latest, { ...buildBrowserBookmarkLink(title, url), folderId }]
    updateSettings({ browserQuickLinks: nextList })
  }

  const removeLink = async (link: BrowserQuickLink): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.settings.BrowserQuickLinksPane.deleteLinkTitle',
        'Delete "{{value0}}"?',
        { value0: link.title }
      ),
      description: translate(
        'auto.components.settings.BrowserQuickLinksPane.deleteLinkDescription',
        'This quick link will be removed everywhere.'
      ),
      confirmLabel: translate(
        'auto.components.settings.BrowserQuickLinksPane.deleteConfirm',
        'Delete'
      ),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }
    const latest = useAppStore.getState().settings?.browserQuickLinks ?? []
    updateSettings({ browserQuickLinks: latest.filter((entry) => entry.id !== link.id) })
  }

  const saveFolder = (name: string): void => {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    const latest = useAppStore.getState().settings?.browserQuickLinkFolders ?? []
    if (folderEditor?.folder) {
      updateSettings({
        browserQuickLinkFolders: latest.map((entry) =>
          entry.id === folderEditor.folder!.id ? { ...entry, name: trimmed } : entry
        )
      })
      return
    }
    updateSettings({
      browserQuickLinkFolders: [...latest, { id: createBrowserBookmarkLinkId(), name: trimmed }]
    })
  }

  const removeFolder = async (folder: BrowserQuickLinkFolder): Promise<void> => {
    const confirmed = await confirm({
      title: translate(
        'auto.components.settings.BrowserQuickLinksPane.deleteFolderTitle',
        'Delete folder "{{value0}}"?',
        { value0: folder.name }
      ),
      description: translate(
        'auto.components.settings.BrowserQuickLinksPane.deleteFolderDescription',
        'Links inside this folder move to the root level.'
      ),
      confirmLabel: translate(
        'auto.components.settings.BrowserQuickLinksPane.deleteConfirm',
        'Delete'
      ),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }
    const state = useAppStore.getState().settings
    updateSettings({
      browserQuickLinkFolders: (state?.browserQuickLinkFolders ?? []).filter(
        (entry) => entry.id !== folder.id
      ),
      browserQuickLinks: (state?.browserQuickLinks ?? []).map((entry) =>
        entry.folderId === folder.id ? { ...entry, folderId: null } : entry
      )
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="space-y-1">
          <Label>
            {translate(
              'auto.components.settings.BrowserQuickLinksPane.heading',
              'Browser Quick Links'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.BrowserQuickLinksPane.headingDescription',
              'Global shortcuts shown in the Bookmarks sidebar. Organize them into folders or keep them at the root level.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFolderEditor({ mode: 'add', folder: null })}
          >
            <FolderPlus />
            {translate('auto.components.settings.BrowserQuickLinksPane.newFolder', 'New Folder')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinkEditor({ mode: 'add', link: null })}
          >
            <Plus />
            {translate('auto.components.settings.BrowserQuickLinksPane.addLink', 'Add Quick Link')}
          </Button>
        </div>
      </div>

      {links.length === 0 && folders.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {translate(
            'auto.components.settings.BrowserQuickLinksPane.empty',
            'No quick links yet. Add shortcuts to the sites you open all the time.'
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {rootLinks.length > 0 ? (
            <div className="rounded-md border border-border">
              {rootLinks.map((link) => (
                <QuickLinkRow
                  key={link.id}
                  link={link}
                  onEdit={() => setLinkEditor({ mode: 'edit', link })}
                  onRemove={() => void removeLink(link)}
                />
              ))}
            </div>
          ) : null}
          {folders.map((folder) => {
            const folderLinks = linksByFolder.get(folder.id) ?? []
            return (
              <div key={folder.id} className="rounded-md border border-border">
                <div className="flex h-9 items-center gap-2 border-b border-border bg-muted/40 px-3">
                  <Folder size={14} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
                  <span className="text-xs text-muted-foreground">{folderLinks.length}</span>
                  <RowAction
                    label={translate(
                      'auto.components.settings.BrowserQuickLinksPane.renameFolder',
                      'Rename folder'
                    )}
                    onClick={() => setFolderEditor({ mode: 'rename', folder })}
                  >
                    <Pencil size={13} />
                  </RowAction>
                  <RowAction
                    label={translate(
                      'auto.components.settings.BrowserQuickLinksPane.deleteFolder',
                      'Delete folder'
                    )}
                    destructive
                    onClick={() => void removeFolder(folder)}
                  >
                    <Trash2 size={13} />
                  </RowAction>
                </div>
                {folderLinks.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {translate(
                      'auto.components.settings.BrowserQuickLinksPane.emptyFolder',
                      'Empty folder.'
                    )}
                  </p>
                ) : (
                  folderLinks.map((link) => (
                    <QuickLinkRow
                      key={link.id}
                      link={link}
                      onEdit={() => setLinkEditor({ mode: 'edit', link })}
                      onRemove={() => void removeLink(link)}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      {linkEditor !== null ? (
        <BrowserQuickLinkDialog
          mode={linkEditor.mode}
          link={linkEditor.link}
          folders={folders}
          onOpenChange={(open) => !open && setLinkEditor(null)}
          onSave={saveLink}
        />
      ) : null}
      {folderEditor !== null ? (
        <BrowserQuickLinkFolderDialog
          mode={folderEditor.mode}
          folder={folderEditor.folder}
          onOpenChange={(open) => !open && setFolderEditor(null)}
          onSave={saveFolder}
        />
      ) : null}
    </div>
  )
}

function QuickLinkRow({
  link,
  onEdit,
  onRemove
}: {
  link: BrowserQuickLink
  onEdit: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex h-9 items-center gap-2 border-b border-border px-3 last:border-b-0">
      <Globe size={14} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 shrink truncate text-sm">{link.title}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {link.url}
      </span>
      <RowAction
        label={translate('auto.components.settings.BrowserQuickLinksPane.editLink', 'Edit link')}
        onClick={onEdit}
      >
        <Pencil size={13} />
      </RowAction>
      <RowAction
        label={translate(
          'auto.components.settings.BrowserQuickLinksPane.deleteLink',
          'Delete link'
        )}
        destructive
        onClick={onRemove}
      >
        <Trash2 size={13} />
      </RowAction>
    </div>
  )
}

function RowAction({
  label,
  destructive,
  onClick,
  children
}: {
  label: string
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent ${
        destructive ? 'hover:text-destructive' : 'hover:text-foreground'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
