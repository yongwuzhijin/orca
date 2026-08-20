export const BROWSER_NETWORK_LOG_MAX_ENTRIES = 200

export type BrowserNetworkLogEntry = {
  /** Electron's webRequest request id, unique per in-flight request. */
  id: number
  url: string
  method: string
  resourceType: string
  startedAt: number
  statusCode?: number
  fromCache?: boolean
  error?: string
  /** Absent means in flight OR a superseded redirect hop, which never gets finished. */
  durationMs?: number
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string[]>
}

export type BrowserNetworkLogRead = {
  /** Newest first. */
  entries: BrowserNetworkLogEntry[]
  /** True when the buffer held more than the requested limit. */
  truncated: boolean
}
