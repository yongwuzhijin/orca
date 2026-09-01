import React from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import type { BrowserWorkspace } from '../../../../../shared/browser-workspace-types'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'
import BrowserPane from '@/components/browser-pane/assemble-chrome/browser-workspace-pane'
import { portToPreviewUrl } from './review-port-url'

type ReviewBrowserPaneProps = {
  taskId: string
  worktreeId: string | null
}

function reviewBrowserPageId(taskId: string): string {
  return `todo-review-browser:${taskId}`
}

function findReviewBrowserTab(
  worktreeId: string,
  taskId: string,
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>,
  browserPagesByWorkspace: Record<string, { id: string; workspaceId: string; url?: string }[]>
): BrowserWorkspace | null {
  const pageId = reviewBrowserPageId(taskId)
  let workspaceId: string | null = null
  for (const pages of Object.values(browserPagesByWorkspace)) {
    const match = pages.find((page) => page.id === pageId)
    if (match) {
      workspaceId = match.workspaceId
      break
    }
  }
  if (!workspaceId) {
    return null
  }
  return (browserTabsByWorktree[worktreeId] ?? []).find((tab) => tab.id === workspaceId) ?? null
}

export function ReviewBrowserPane({
  taskId,
  worktreeId
}: ReviewBrowserPaneProps): React.JSX.Element {
  const createBrowserTab = useAppStore((s) => s.createBrowserTab)
  const setBrowserPageUrl = useAppStore((s) => s.setBrowserPageUrl)
  const browserTabsByWorktree = useAppStore((s) => s.browserTabsByWorktree)
  const browserPagesByWorkspace = useAppStore((s) => s.browserPagesByWorkspace)

  const reviewPageId = reviewBrowserPageId(taskId)
  const [ports, setPorts] = React.useState<WorkspacePort[]>([])
  const [selectedUrl, setSelectedUrl] = React.useState<string | null>(null)
  const lastNavigatedUrlRef = React.useRef<string | null>(null)
  const ensureTabAttemptedRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    void window.api.todos.review.scanPorts({ taskId }).then((detected) => {
      if (cancelled) {
        return
      }
      setPorts(detected)
      if (detected.length > 0) {
        setSelectedUrl(portToPreviewUrl(detected[0]))
      }
    })
    return () => {
      cancelled = true
    }
  }, [taskId])

  React.useEffect(() => {
    ensureTabAttemptedRef.current = false
    lastNavigatedUrlRef.current = null
  }, [worktreeId, taskId])

  const browserTab = React.useMemo(() => {
    if (!worktreeId) {
      return null
    }
    return findReviewBrowserTab(worktreeId, taskId, browserTabsByWorktree, browserPagesByWorkspace)
  }, [browserPagesByWorkspace, browserTabsByWorktree, taskId, worktreeId])

  // Side effect: create the review browser tab once; never call store setters from useMemo.
  React.useEffect(() => {
    if (!worktreeId) {
      return
    }
    if (findReviewBrowserTab(worktreeId, taskId, browserTabsByWorktree, browserPagesByWorkspace)) {
      return
    }
    if (ensureTabAttemptedRef.current) {
      return
    }
    ensureTabAttemptedRef.current = true
    const url = selectedUrl ?? ORCA_BROWSER_BLANK_URL
    try {
      createBrowserTab(worktreeId, url, {
        activate: false,
        browserPageId: reviewPageId,
        title: translate('auto.components.todo.detail.ReviewBrowserPane.title', 'Review')
      })
    } catch {
      ensureTabAttemptedRef.current = false
    }
  }, [
    browserPagesByWorkspace,
    browserTabsByWorktree,
    createBrowserTab,
    reviewPageId,
    selectedUrl,
    taskId,
    worktreeId
  ])

  const browserTabId = browserTab?.id ?? null
  const browserPageId = browserTab?.activePageId ?? browserTab?.pageIds?.[0] ?? reviewPageId

  // Navigate only when selectedUrl changes and differs from the page's current URL.
  React.useEffect(() => {
    if (!browserTabId || !selectedUrl || selectedUrl === ORCA_BROWSER_BLANK_URL) {
      return
    }
    if (lastNavigatedUrlRef.current === selectedUrl) {
      return
    }
    const page = (browserPagesByWorkspace[browserTabId] ?? []).find(
      (entry) => entry.id === browserPageId
    )
    if (page?.url === selectedUrl) {
      lastNavigatedUrlRef.current = selectedUrl
      return
    }
    lastNavigatedUrlRef.current = selectedUrl
    setBrowserPageUrl(browserPageId, selectedUrl)
  }, [browserPageId, browserPagesByWorkspace, browserTabId, selectedUrl, setBrowserPageUrl])

  if (!worktreeId || !browserTab) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.todo.detail.ReviewBrowserPane.noWorktree',
          'Start the task in a workspace to reuse the embedded browser here.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {ports.length > 1 ? (
        <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
          <label className="text-xs text-muted-foreground">
            {translate('auto.components.todo.detail.ReviewBrowserPane.portLabel', 'Port')}
          </label>
          <select
            className="h-7 flex-1 rounded border border-border bg-background text-xs"
            onChange={(e) => {
              lastNavigatedUrlRef.current = null
              setSelectedUrl(e.target.value)
            }}
            value={selectedUrl ?? ''}
          >
            {ports.map((port) => {
              const url = portToPreviewUrl(port)
              return (
                <option key={port.id} value={url}>
                  {url}
                </option>
              )
            })}
          </select>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <BrowserPane browserTab={browserTab} isActive chromeShortcutScope="inactive" />
      </div>
    </div>
  )
}
