// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkLogEntry } from '../../../../../shared/browser-network-log-types'
import { BrowserNetworkLogTab } from './browser-network-log-tab'

const ENTRY: BrowserNetworkLogEntry = {
  id: 1,
  url: 'https://api.example.com/items?page=2',
  method: 'GET',
  resourceType: 'xhr',
  startedAt: 1_700_000_000_000,
  statusCode: 200,
  durationMs: 42
}

const networkReadLog = vi.fn(async () => ({ entries: [ENTRY], truncated: false }))

beforeEach(() => {
  networkReadLog.mockClear()
  Object.assign(window, { api: { browser: { networkReadLog } } })
})

afterEach(cleanup)

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
})
