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
