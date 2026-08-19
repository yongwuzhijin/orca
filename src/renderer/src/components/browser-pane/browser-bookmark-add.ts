import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { BrowserBookmarkLink } from '../../../../shared/browser-workspace-types'
import { bookmarkUrlsMatch, buildBrowserBookmarkLink } from '@/lib/browser-bookmark-links'
import { translate } from '@/i18n/i18n'

function isDuplicate(links: { url: string }[], url: string): boolean {
  return links.some((link) => bookmarkUrlsMatch(link.url, url))
}

function toastDuplicate(): void {
  toast.info(
    translate(
      'auto.components.browser.pane.browser.bookmark.add.duplicate',
      'This page is already in that bookmark list.'
    )
  )
}

export function addBookmarkToBranchDocs(worktreeId: string, title: string, url: string): void {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree) {
    return
  }
  const existing: BrowserBookmarkLink[] =
    'browserDocLinks' in worktree ? (worktree.browserDocLinks ?? []) : []
  if (isDuplicate(existing, url)) {
    toastDuplicate()
    return
  }
  void state.updateWorktreeMeta(worktreeId, {
    browserDocLinks: [...existing, buildBrowserBookmarkLink(title, url)]
  })
  toast.success(
    translate(
      'auto.components.browser.pane.browser.bookmark.add.addedToBranchDocs',
      'Added to Branch Docs'
    )
  )
}

export function addBookmarkToProjectLinks(repoId: string, title: string, url: string): void {
  const state = useAppStore.getState()
  const projectLinks = state.settings?.browserProjectLinks ?? {}
  const existing = projectLinks[repoId] ?? []
  if (isDuplicate(existing, url)) {
    toastDuplicate()
    return
  }
  void state.updateSettings({
    browserProjectLinks: {
      ...projectLinks,
      [repoId]: [...existing, buildBrowserBookmarkLink(title, url)]
    }
  })
  toast.success(
    translate(
      'auto.components.browser.pane.browser.bookmark.add.addedToProjectLinks',
      'Added to Project Links'
    )
  )
}

export function addBookmarkToQuickLinks(title: string, url: string, folderId: string | null): void {
  const state = useAppStore.getState()
  const existing = state.settings?.browserQuickLinks ?? []
  if (isDuplicate(existing, url)) {
    toastDuplicate()
    return
  }
  void state.updateSettings({
    browserQuickLinks: [...existing, { ...buildBrowserBookmarkLink(title, url), folderId }]
  })
  toast.success(
    translate(
      'auto.components.browser.pane.browser.bookmark.add.addedToQuickLinks',
      'Added to Quick Links'
    )
  )
}
