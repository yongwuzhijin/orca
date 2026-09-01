// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { BrowserWorkspace } from '../../../../../shared/browser-workspace-types'

const listeners = new Set<() => void>()

function notifyStore(): void {
  for (const listener of listeners) {
    listener()
  }
}

function makeReviewTab(worktreeId: string, pageId: string, url: string): BrowserWorkspace {
  return {
    id: 'ws-1',
    worktreeId,
    activePageId: pageId,
    pageIds: [pageId],
    url,
    title: 'Review',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1
  }
}

const createBrowserTab = vi.fn(
  (worktreeId: string, url: string, options?: { browserPageId?: string }) => {
    const pageId = options?.browserPageId ?? 'page-1'
    const tab = makeReviewTab(worktreeId, pageId, url)
    storeState.browserTabsByWorktree = {
      ...storeState.browserTabsByWorktree,
      [worktreeId]: [tab]
    }
    storeState.browserPagesByWorkspace = {
      ...storeState.browserPagesByWorkspace,
      [tab.id]: [{ id: pageId, workspaceId: tab.id, url }]
    }
    notifyStore()
    return tab
  }
)

const setBrowserPageUrl = vi.fn((pageId: string, url: string) => {
  const nextPagesByWorkspace = { ...storeState.browserPagesByWorkspace }
  for (const [workspaceId, pages] of Object.entries(nextPagesByWorkspace)) {
    nextPagesByWorkspace[workspaceId] = pages.map((entry) =>
      entry.id === pageId ? { ...entry, url } : entry
    )
  }
  storeState.browserPagesByWorkspace = nextPagesByWorkspace
  notifyStore()
})

const storeState = {
  browserTabsByWorktree: {} as Record<string, BrowserWorkspace[]>,
  browserPagesByWorkspace: {} as Record<string, { id: string; workspaceId: string; url: string }[]>,
  createBrowserTab,
  setBrowserPageUrl
}

vi.mock('@/store', async () => {
  const React = await import('react')
  return {
    useAppStore: (selector: (state: typeof storeState) => unknown) =>
      React.useSyncExternalStore(
        (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        () => selector(storeState),
        () => selector(storeState)
      )
  }
})

vi.mock('@/components/browser-pane/assemble-chrome/browser-workspace-pane', () => ({
  default: () => <div>browser-pane</div>
}))

const scanPorts = vi.fn()

beforeEach(() => {
  storeState.browserTabsByWorktree = {}
  storeState.browserPagesByWorkspace = {}
  createBrowserTab.mockClear()
  setBrowserPageUrl.mockClear()
  ;(window as unknown as { api: unknown }).api = {
    todos: { review: { scanPorts } }
  }
})

afterEach(() => {
  cleanup()
})

const { ReviewBrowserPane } = await import('./ReviewBrowserPane')

describe('ReviewBrowserPane', () => {
  it('shows empty state when no worktree is bound', async () => {
    scanPorts.mockResolvedValue([])
    render(<ReviewBrowserPane taskId="t1" worktreeId={null} />)
    expect(await screen.findByText(/start the task in a workspace/i)).toBeInTheDocument()
  })

  it('renders the shared browser pane when a worktree is bound', async () => {
    scanPorts.mockResolvedValue([])
    render(<ReviewBrowserPane taskId="t1" worktreeId="wt-1" />)
    expect(await screen.findByText('browser-pane')).toBeInTheDocument()
    expect(createBrowserTab).toHaveBeenCalledTimes(1)
  })

  it('navigates at most once when scan returns a port url', async () => {
    scanPorts.mockResolvedValue([
      {
        id: 'p1',
        bindHost: '0.0.0.0',
        connectHost: 'localhost',
        port: 5173,
        protocol: 'http',
        kind: 'workspace',
        owner: { worktreeId: 'wt-1', repoId: 'r', displayName: 'r', path: '/x', confidence: 'cwd' }
      }
    ])
    render(<ReviewBrowserPane taskId="t1" worktreeId="wt-1" />)
    await screen.findByText('browser-pane')
    await waitFor(() => {
      expect(setBrowserPageUrl.mock.calls.length).toBeLessThanOrEqual(1)
    })
  })
})
