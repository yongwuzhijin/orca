// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BrowserNetworkLogEntry,
  BrowserNetworkLogRead
} from '../../../../../shared/browser-network-log-types'
import { BrowserNetworkLogTab } from './browser-network-log-tab'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

const POLL_MS = 1500

const ENTRY: BrowserNetworkLogEntry = {
  id: 1,
  url: 'https://api.example.com/items?page=2',
  method: 'GET',
  resourceType: 'xhr',
  startedAt: 1_700_000_000_000,
  statusCode: 200,
  durationMs: 42
}

const networkReadLog = vi.fn(
  async (): Promise<BrowserNetworkLogRead> => ({ entries: [ENTRY], truncated: false })
)

beforeEach(() => {
  networkReadLog.mockClear()
  // The panel store is module state, so a prefill from one case would leak into the next.
  useBrowserNetworkToolsPanel.getState().close()
  Object.assign(window, { api: { browser: { networkReadLog } } })
})

afterEach(cleanup)

function filterInput(): HTMLElement {
  return screen.getByRole('searchbox')
}

describe('BrowserNetworkLogTab', () => {
  it('renders a row per request with status and duration', async () => {
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    expect(await screen.findByText('200')).toBeTruthy()
    expect(screen.getByText('GET')).toBeTruthy()
    expect(screen.getByText('42 ms')).toBeTruthy()
    expect(screen.getByTitle(ENTRY.url)).toBeTruthy()
  })

  it('reads only its own page', async () => {
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    await screen.findByText('200')
    expect(networkReadLog).toHaveBeenCalledWith({ browserPageId: 'page-a', limit: 100 })
  })

  it('shows the error instead of a status for a failed request', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [
        { ...ENTRY, id: 2, statusCode: undefined, error: 'net::ERR_ABORTED' },
        // A request can fail after its response headers arrived, so the error must win over 500.
        { ...ENTRY, id: 3, statusCode: 500, error: 'net::ERR_FAILED' }
      ],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    expect(await screen.findByText('net::ERR_ABORTED')).toBeTruthy()
    expect(screen.getByText('net::ERR_FAILED')).toBeTruthy()
    expect(screen.queryByText('500')).toBeNull()
  })

  it('says so when the buffer holds more than the shown window', async () => {
    networkReadLog.mockResolvedValueOnce({ entries: [ENTRY], truncated: true })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    expect(await screen.findByText(/newest 100 requests/)).toBeTruthy()
  })

  it('explains an empty log rather than showing a blank pane', async () => {
    networkReadLog.mockResolvedValueOnce({ entries: [], truncated: false })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    expect(await screen.findByText(/No requests recorded/)).toBeTruthy()
  })

  it('survives a rejecting read instead of crashing the pane', async () => {
    networkReadLog.mockRejectedValueOnce(new Error('ipc down'))
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    expect(await screen.findByText(/No requests recorded/)).toBeTruthy()
  })

  it('shows an em-dash for a request with no status or duration yet', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [{ ...ENTRY, statusCode: undefined, durationMs: undefined }],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    expect(await screen.findByText('xhr')).toBeTruthy()
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('marks a failed request as destructive so it reads as an error', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [{ ...ENTRY, statusCode: undefined, error: 'net::ERR_ABORTED' }],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    const status = await screen.findByText('net::ERR_ABORTED')
    expect(status.className).toContain('text-destructive')
  })

  it('re-reads on demand when Refresh is clicked', async () => {
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    await screen.findByText('200')
    expect(networkReadLog).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }))
    await waitFor(() => expect(networkReadLog).toHaveBeenCalledTimes(2))
  })

  it('polls while mounted and stops polling after unmount', async () => {
    vi.useFakeTimers()
    try {
      const view = render(<BrowserNetworkLogTab browserPageId="page-a" />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(networkReadLog).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS)
      })
      expect(networkReadLog).toHaveBeenCalledTimes(2)
      view.unmount()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_MS * 2)
      })
      expect(networkReadLog).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a read that resolves after the page id changed', async () => {
    let releaseA: (read: BrowserNetworkLogRead) => void = () => {}
    networkReadLog.mockReturnValueOnce(
      new Promise<BrowserNetworkLogRead>((resolve) => {
        releaseA = resolve
      })
    )
    const view = render(<BrowserNetworkLogTab browserPageId="page-a" />)
    view.rerender(<BrowserNetworkLogTab browserPageId="page-b" />)
    await screen.findByText('200')
    releaseA({ entries: [{ ...ENTRY, id: 9, statusCode: 418 }], truncated: false })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('418')).toBeNull()
  })

  it('seeds the API tab with a logged request', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [
        {
          ...ENTRY,
          method: 'POST',
          requestHeaders: { Accept: 'application/json', Host: 'api.example.com' }
        }
      ],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    fireEvent.click(await screen.findByRole('button', { name: /API tab/ }))
    const panel = useBrowserNetworkToolsPanel.getState()
    expect(panel.openPageId).toBe('page-a')
    expect(panel.tab).toBe('api')
    expect(panel.apiPrefill).toEqual({
      method: 'POST',
      url: ENTRY.url,
      // Host belongs to net.request, so it must not arrive as an editable row.
      headers: [{ name: 'Accept', value: 'application/json', enabled: true }]
    })
  })

  it('keeps only the rows whose URL contains the typed text', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [
        { ...ENTRY, id: 10, url: 'https://api.example.com/items' },
        { ...ENTRY, id: 11, url: 'https://cdn.example.com/logo.png' }
      ],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    await screen.findByTitle('https://cdn.example.com/logo.png')
    fireEvent.change(filterInput(), { target: { value: 'cdn' } })
    expect(screen.getByTitle('https://cdn.example.com/logo.png')).toBeTruthy()
    expect(screen.queryByTitle('https://api.example.com/items')).toBeNull()
  })

  it('matches the method so a bare verb narrows the list', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [
        { ...ENTRY, id: 12, method: 'POST', url: 'https://api.example.com/create' },
        { ...ENTRY, id: 13, method: 'GET', url: 'https://api.example.com/read' }
      ],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    await screen.findByTitle('https://api.example.com/read')
    fireEvent.change(filterInput(), { target: { value: 'post' } })
    expect(screen.getByTitle('https://api.example.com/create')).toBeTruthy()
    expect(screen.queryByTitle('https://api.example.com/read')).toBeNull()
  })

  it('distinguishes a filtered-out list from a log that captured nothing', async () => {
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    await screen.findByText('200')
    fireEvent.change(filterInput(), { target: { value: 'nothing-matches-this' } })
    expect(screen.getByText(/No requests match/)).toBeTruthy()
    expect(screen.queryByText(/No requests recorded/)).toBeNull()
  })

  it('offers no send button for a request the sender cannot replay', async () => {
    networkReadLog.mockResolvedValueOnce({
      entries: [{ ...ENTRY, url: 'ws://api.example.com/socket' }],
      truncated: false
    })
    render(<BrowserNetworkLogTab browserPageId="page-a" />)
    await screen.findByText('xhr')
    expect(screen.queryByRole('button', { name: /API tab/ })).toBeNull()
  })
})
