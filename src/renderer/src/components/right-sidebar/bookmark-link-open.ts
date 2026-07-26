import { useAppStore } from '@/store'
import { bookmarkUrlsMatch } from '@/lib/browser-bookmark-links'

/** Opens the URL in the active workspace's browser, focusing an already-open page instead of duplicating it. */
export function openOrFocusBookmarkUrl(url: string): void {
  const state = useAppStore.getState()
  const worktreeId = state.activeWorktreeId
  if (!worktreeId) {
    return
  }
  const tabs = state.browserTabsByWorktree[worktreeId] ?? []
  for (const tab of tabs) {
    const pages = state.browserPagesByWorkspace[tab.id] ?? []
    const page = pages.find((candidate) => bookmarkUrlsMatch(candidate.url, url))
    if (page) {
      state.focusBrowserTabInWorktree(worktreeId, page.id)
      return
    }
  }
  state.createBrowserTab(worktreeId, url, { activate: true })
}
