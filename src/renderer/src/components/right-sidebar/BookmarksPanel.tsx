import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Plus,
  Settings2
} from 'lucide-react'
import { useAppStore } from '@/store'
import { useActiveRepo, useActiveWorktree } from '@/store/selectors'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import type { BrowserBookmarkLink, BrowserQuickLink } from '../../../../shared/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildBrowserBookmarkLink } from '@/lib/browser-bookmark-links'
import { translate } from '@/i18n/i18n'
import { BookmarkLinkDialog } from './BookmarkLinkDialog'
import { BookmarkEmptyHint, BookmarkIconAction, BookmarkListRow } from './BookmarkListRow'
import { openOrFocusBookmarkUrl } from './bookmark-link-open'

type LinkDialogState = {
  section: 'docs' | 'project'
  link: BrowserBookmarkLink | null
}

export default function BookmarksPanel(): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()
  const settings = useAppStore((s) => s.settings)
  const updateWorktreeMeta = useAppStore((s) => s.updateWorktreeMeta)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)

  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null)
  const [projectLinksOpen, setProjectLinksOpen] = useState(true)
  const [quickLinksOpen, setQuickLinksOpen] = useState(true)
  const [collapsedQuickFolders, setCollapsedQuickFolders] = useState<Set<string>>(() => new Set())

  // Why: folder workspaces have no branch, and their meta channel drops unknown fields — hide the branch-docs editor there.
  const isFolderWorkspace = parseWorkspaceKey(activeWorktree?.id ?? '')?.type === 'folder'
  const canEditDocs = Boolean(activeWorktree) && !isFolderWorkspace
  const docLinks = (canEditDocs ? activeWorktree?.browserDocLinks : undefined) ?? []

  const repoId = activeWorktree?.repoId ?? activeRepo?.id ?? null
  const projectLinks = (repoId ? settings?.browserProjectLinks?.[repoId] : undefined) ?? []

  const quickLinksSource = settings?.browserQuickLinks
  const quickLinks = useMemo(() => quickLinksSource ?? [], [quickLinksSource])
  const quickLinkFolders = settings?.browserQuickLinkFolders ?? []
  const rootQuickLinks = quickLinks.filter((link) => !link.folderId)
  const quickLinksByFolder = useMemo(() => {
    const byFolder = new Map<string, BrowserQuickLink[]>()
    for (const link of quickLinks) {
      if (!link.folderId) {
        continue
      }
      const bucket = byFolder.get(link.folderId) ?? []
      bucket.push(link)
      byFolder.set(link.folderId, bucket)
    }
    return byFolder
  }, [quickLinks])

  const saveDocLinks = (links: BrowserBookmarkLink[]): void => {
    if (activeWorktree) {
      void updateWorktreeMeta(activeWorktree.id, { browserDocLinks: links })
    }
  }

  const saveProjectLinks = (links: BrowserBookmarkLink[]): void => {
    if (!repoId) {
      return
    }
    void updateSettings({
      browserProjectLinks: { ...settings?.browserProjectLinks, [repoId]: links }
    })
  }

  const handleDialogSave = (title: string, url: string): void => {
    if (!linkDialog) {
      return
    }
    const currentLinks = linkDialog.section === 'docs' ? docLinks : projectLinks
    const nextLinks = linkDialog.link
      ? currentLinks.map((entry) =>
          entry.id === linkDialog.link!.id
            ? { ...entry, title: title.trim() || entry.title, url }
            : entry
        )
      : [...currentLinks, buildBrowserBookmarkLink(title, url)]
    if (linkDialog.section === 'docs') {
      saveDocLinks(nextLinks)
    } else {
      saveProjectLinks(nextLinks)
    }
  }

  const toggleQuickFolder = (folderId: string): void => {
    setCollapsedQuickFolders((current) => {
      const next = new Set(current)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const openQuickLinksSettings = (): void => {
    openSettingsTarget({ pane: 'quick-links', repoId: null })
    openSettingsPage()
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full min-h-0 flex-col bg-sidebar">
        {/* ── Branch docs (workspace-scoped) ── */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground">
              {translate('auto.components.right.sidebar.BookmarksPanel.branchDocs', 'Branch Docs')}
            </span>
            {canEditDocs ? (
              <BookmarkIconAction
                label={translate(
                  'auto.components.right.sidebar.BookmarksPanel.addDoc',
                  'Add doc link'
                )}
                onClick={() => setLinkDialog({ section: 'docs', link: null })}
              >
                <Plus size={14} />
              </BookmarkIconAction>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {!canEditDocs ? (
              <BookmarkEmptyHint
                text={translate(
                  'auto.components.right.sidebar.BookmarksPanel.noWorkspace',
                  'Open a git workspace to attach branch doc links.'
                )}
              />
            ) : docLinks.length === 0 ? (
              <BookmarkEmptyHint
                text={translate(
                  'auto.components.right.sidebar.BookmarksPanel.emptyDocs',
                  'No doc links for this branch yet. Add project docs, specs, or PRDs related to this work.'
                )}
              />
            ) : (
              docLinks.map((link) => (
                <BookmarkListRow
                  key={link.id}
                  link={link}
                  icon={<FileText size={14} className="shrink-0 text-muted-foreground" />}
                  onOpen={() => openOrFocusBookmarkUrl(link.url)}
                  onEdit={() => setLinkDialog({ section: 'docs', link })}
                  onDelete={() => saveDocLinks(docLinks.filter((entry) => entry.id !== link.id))}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Bottom accordion: project links + quick links ── */}
        <div className="shrink-0 border-t border-sidebar-border">
          <Collapsible open={projectLinksOpen} onOpenChange={setProjectLinksOpen}>
            <div className="flex h-8 items-center justify-between pr-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex h-full min-w-0 flex-1 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  {projectLinksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="truncate">
                    {translate(
                      'auto.components.right.sidebar.BookmarksPanel.projectLinks',
                      'Project Links'
                    )}
                  </span>
                  <span className="text-muted-foreground">{projectLinks.length}</span>
                </button>
              </CollapsibleTrigger>
              {repoId ? (
                <BookmarkIconAction
                  label={translate(
                    'auto.components.right.sidebar.BookmarksPanel.addProjectLink',
                    'Add project link'
                  )}
                  onClick={() => setLinkDialog({ section: 'project', link: null })}
                >
                  <Plus size={14} />
                </BookmarkIconAction>
              ) : null}
            </div>
            <CollapsibleContent>
              <div className="max-h-[26vh] overflow-y-auto pb-1">
                {projectLinks.length === 0 ? (
                  <BookmarkEmptyHint
                    text={translate(
                      'auto.components.right.sidebar.BookmarksPanel.emptyProjectLinks',
                      'Project-wide links stay available across branches and workspaces.'
                    )}
                  />
                ) : (
                  projectLinks.map((link) => (
                    <BookmarkListRow
                      key={link.id}
                      link={link}
                      icon={<Globe size={14} className="shrink-0 text-muted-foreground" />}
                      onOpen={() => openOrFocusBookmarkUrl(link.url)}
                      onEdit={() => setLinkDialog({ section: 'project', link })}
                      onDelete={() =>
                        saveProjectLinks(projectLinks.filter((entry) => entry.id !== link.id))
                      }
                    />
                  ))
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={quickLinksOpen} onOpenChange={setQuickLinksOpen}>
            <div className="flex h-8 items-center justify-between border-t border-sidebar-border pr-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex h-full min-w-0 flex-1 items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  {quickLinksOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span className="truncate">
                    {translate(
                      'auto.components.right.sidebar.BookmarksPanel.quickLinks',
                      'Quick Links'
                    )}
                  </span>
                  <span className="text-muted-foreground">{quickLinks.length}</span>
                </button>
              </CollapsibleTrigger>
              <BookmarkIconAction
                label={translate(
                  'auto.components.right.sidebar.BookmarksPanel.manageQuickLinks',
                  'Manage quick links in Settings'
                )}
                onClick={openQuickLinksSettings}
              >
                <Settings2 size={14} />
              </BookmarkIconAction>
            </div>
            <CollapsibleContent>
              <div className="max-h-[26vh] overflow-y-auto pb-1">
                {quickLinks.length === 0 ? (
                  <BookmarkEmptyHint
                    text={translate(
                      'auto.components.right.sidebar.BookmarksPanel.emptyQuickLinks',
                      'Global shortcuts managed from Settings → Browser Quick Links.'
                    )}
                  />
                ) : (
                  <>
                    {rootQuickLinks.map((link) => (
                      <BookmarkListRow
                        key={link.id}
                        link={link}
                        icon={<Globe size={14} className="shrink-0 text-muted-foreground" />}
                        onOpen={() => openOrFocusBookmarkUrl(link.url)}
                      />
                    ))}
                    {quickLinkFolders.map((folder) => {
                      const folderLinks = quickLinksByFolder.get(folder.id) ?? []
                      const collapsed = collapsedQuickFolders.has(folder.id)
                      return (
                        <div key={folder.id}>
                          <button
                            type="button"
                            className="flex h-7 w-full items-center gap-1.5 px-3 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent"
                            onClick={() => toggleQuickFolder(folder.id)}
                          >
                            {collapsed ? (
                              <Folder size={14} className="shrink-0 text-muted-foreground" />
                            ) : (
                              <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                            )}
                            <span className="truncate">{folder.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {folderLinks.length}
                            </span>
                          </button>
                          {!collapsed
                            ? folderLinks.map((link) => (
                                <BookmarkListRow
                                  key={link.id}
                                  link={link}
                                  indent
                                  icon={
                                    <Globe size={14} className="shrink-0 text-muted-foreground" />
                                  }
                                  onOpen={() => openOrFocusBookmarkUrl(link.url)}
                                />
                              ))
                            : null}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <BookmarkLinkDialog
          open={linkDialog !== null}
          heading={
            linkDialog?.link
              ? translate('auto.components.right.sidebar.BookmarksPanel.editLink', 'Edit Link')
              : linkDialog?.section === 'project'
                ? translate(
                    'auto.components.right.sidebar.BookmarksPanel.addProjectLinkTitle',
                    'Add Project Link'
                  )
                : translate(
                    'auto.components.right.sidebar.BookmarksPanel.addDocTitle',
                    'Add Branch Doc Link'
                  )
          }
          initialTitle={linkDialog?.link?.title}
          initialUrl={linkDialog?.link?.url}
          onOpenChange={(open) => {
            if (!open) {
              setLinkDialog(null)
            }
          }}
          onSave={handleDialogSave}
        />
      </div>
    </TooltipProvider>
  )
}
