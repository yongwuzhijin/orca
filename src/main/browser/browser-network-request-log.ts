import type {
  BrowserNetworkLogEntry,
  BrowserNetworkLogRead
} from '../../shared/browser-network-log-types'

export const BROWSER_NETWORK_LOG_MAX_ENTRIES = 200

export type BrowserNetworkRequestLog = {
  recordStart: (details: Electron.OnBeforeSendHeadersListenerDetails) => void
  recordResponseHeaders: (details: Electron.OnHeadersReceivedListenerDetails) => void
  recordCompletion: (details: Electron.OnCompletedListenerDetails) => void
  recordError: (details: Electron.OnErrorOccurredListenerDetails) => void
  read: (browserPageId: string, limit: number) => BrowserNetworkLogRead
  clear: (browserPageId: string) => void
}

type InFlight = { browserPageId: string; entry: BrowserNetworkLogEntry }

export function createBrowserNetworkRequestLog(
  resolvePageId: (webContentsId: number) => string | null
): BrowserNetworkRequestLog {
  const entriesByPage = new Map<string, BrowserNetworkLogEntry[]>()
  const inFlightById = new Map<number, InFlight>()

  // Why: Date.now() at both ends rather than details.timestamp, whose unit is not documented.
  const finish = (id: number, patch: Partial<BrowserNetworkLogEntry>): void => {
    const inFlight = inFlightById.get(id)
    // Why: dropping the record is what makes a second terminal event for this id a no-op.
    inFlightById.delete(id)
    if (!inFlight) {
      return
    }
    Object.assign(inFlight.entry, patch, {
      durationMs: Math.max(0, Date.now() - inFlight.entry.startedAt)
    })
  }

  return {
    recordStart: (details) => {
      const webContentsId = details.webContentsId
      if (typeof webContentsId !== 'number') {
        return
      }
      // Requests with no owning page (service workers, some prefetches) are never logged.
      const browserPageId = resolvePageId(webContentsId)
      if (!browserPageId) {
        return
      }
      const entry: BrowserNetworkLogEntry = {
        id: details.id,
        url: details.url,
        method: details.method,
        resourceType: details.resourceType,
        startedAt: Date.now(),
        requestHeaders: { ...details.requestHeaders }
      }
      const entries = entriesByPage.get(browserPageId) ?? []
      entries.push(entry)
      while (entries.length > BROWSER_NETWORK_LOG_MAX_ENTRIES) {
        const evicted = entries.shift()
        // Why: bounds the in-flight map for requests that never complete; the entry is already gone.
        if (evicted) {
          inFlightById.delete(evicted.id)
        }
      }
      entriesByPage.set(browserPageId, entries)
      inFlightById.set(details.id, { browserPageId, entry })
    },

    recordResponseHeaders: (details) => {
      const inFlight = inFlightById.get(details.id)
      if (!inFlight) {
        return
      }
      inFlight.entry.statusCode = details.statusCode
      if (details.responseHeaders) {
        inFlight.entry.responseHeaders = { ...details.responseHeaders }
      }
    },

    recordCompletion: (details) => {
      finish(details.id, { statusCode: details.statusCode, fromCache: details.fromCache })
    },

    recordError: (details) => {
      finish(details.id, { error: details.error })
    },

    read: (browserPageId, limit) => {
      const entries = entriesByPage.get(browserPageId) ?? []
      const capped = Math.max(0, limit)
      return {
        entries: entries.slice(Math.max(0, entries.length - capped)).toReversed(),
        truncated: entries.length > capped
      }
    },

    clear: (browserPageId) => {
      entriesByPage.delete(browserPageId)
      for (const [id, inFlight] of inFlightById) {
        // Why: bounds the in-flight map for requests that never complete; the buffer is already gone.
        if (inFlight.browserPageId === browserPageId) {
          inFlightById.delete(id)
        }
      }
    }
  }
}
