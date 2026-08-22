export const BROWSER_API_TEST_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS'
] as const

export type BrowserApiTestMethod = (typeof BROWSER_API_TEST_METHODS)[number]

/** Bodies above this are cut off; the renderer has to paint whatever we return. */
export const BROWSER_API_TEST_MAX_BODY_BYTES = 2 * 1024 * 1024
export const BROWSER_API_TEST_TIMEOUT_MS = 30_000

export type BrowserApiTestHeader = {
  name: string
  value: string
  enabled: boolean
}

export type BrowserApiTestRequest = {
  browserPageId: string
  /** Renderer-generated; the cancel channel addresses an in-flight send by this id. */
  requestId: string
  method: string
  url: string
  headers: BrowserApiTestHeader[]
  body: string
}

export type BrowserApiTestFailureReason =
  | 'invalid_url'
  | 'invalid_method'
  | 'no_guest'
  | 'busy'
  | 'timeout'
  | 'aborted'
  | 'network'

export type BrowserApiTestResponse =
  | {
      status: 'ok'
      statusCode: number
      statusMessage: string
      headers: Record<string, string[]>
      body: string
      bodyBytes: number
      truncated: boolean
      textual: boolean
      durationMs: number
    }
  | {
      status: 'error'
      reason: BrowserApiTestFailureReason
      /** Diagnostic English text; the renderer localizes from `reason`, not from this. */
      message: string
      durationMs: number
    }
