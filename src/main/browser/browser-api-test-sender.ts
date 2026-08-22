import {
  BROWSER_API_TEST_MAX_BODY_BYTES,
  BROWSER_API_TEST_TIMEOUT_MS,
  type BrowserApiTestFailureReason,
  type BrowserApiTestMethod,
  type BrowserApiTestResponse
} from '../../shared/browser-api-test-types'
import { browserApiTestMethodAllowsBody } from '../../shared/browser-api-test-target'
import {
  firstBrowserApiTestHeaderValue,
  isTextualContentType,
  normalizeBrowserApiTestResponseHeaders,
  summarizeBrowserApiTestBody
} from './browser-api-test-response-body'

/** The slice of Electron's IncomingMessage this module touches. */
export type BrowserApiTestIncomingMessage = {
  statusCode: number
  statusMessage: string
  headers: Record<string, string | string[]>
  on(event: 'data', listener: (chunk: Buffer) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
}

/** The slice of Electron's ClientRequest this module touches. */
export type BrowserApiTestClientRequest = {
  on(event: 'response', listener: (response: BrowserApiTestIncomingMessage) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'abort', listener: () => void): void
  setHeader(name: string, value: string): void
  write(chunk: string): void
  end(): void
  abort(): void
}

export type BrowserApiTestSenderDeps = {
  createRequest: (options: {
    method: string
    url: string
    session: unknown
    useSessionCookies: true
  }) => BrowserApiTestClientRequest
  now: () => number
  timeoutMs?: number
  maxBodyBytes?: number
}

export type BrowserApiTestSendArgs = {
  method: BrowserApiTestMethod
  url: string
  headers: Record<string, string>
  body: string
  session: unknown
}

export type BrowserApiTestSendHandle = {
  result: Promise<BrowserApiTestResponse>
  cancel: () => void
}

// Number() reads '' as 0 and accepts '-5', either of which would claim a size the body never had.
function parseContentLength(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim() ?? ''
  if (trimmed.length === 0) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined
}

export function sendBrowserApiTestRequest(
  args: BrowserApiTestSendArgs,
  deps: BrowserApiTestSenderDeps
): BrowserApiTestSendHandle {
  const startedAt = deps.now()
  const timeoutMs = deps.timeoutMs ?? BROWSER_API_TEST_TIMEOUT_MS
  const maxBodyBytes = deps.maxBodyBytes ?? BROWSER_API_TEST_MAX_BODY_BYTES
  let request: BrowserApiTestClientRequest | null = null
  let settled = false
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const result = new Promise<BrowserApiTestResponse>((resolve) => {
    const finish = (response: BrowserApiTestResponse): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      resolve(response)
    }
    const fail = (reason: BrowserApiTestFailureReason, message: string): void => {
      finish({ status: 'error', reason, message, durationMs: deps.now() - startedAt })
    }

    try {
      request = deps.createRequest({
        method: args.method,
        url: args.url,
        session: args.session,
        // Why: without this Electron sends no cookies and the whole premise — reuse the page's
        // real login — collapses. Never also pass `credentials`; it silently disables this.
        useSessionCookies: true
      })
    } catch (error) {
      fail('network', error instanceof Error ? error.message : String(error))
      return
    }
    const activeRequest = request

    timer = setTimeout(() => {
      timedOut = true
      activeRequest.abort()
    }, timeoutMs)

    activeRequest.on('error', (error) => fail('network', error.message))
    activeRequest.on('abort', () => {
      if (timedOut) {
        fail('timeout', 'Request timed out.')
        return
      }
      fail('aborted', 'Request cancelled.')
    })
    activeRequest.on('response', (response) => {
      const textual = isTextualContentType(
        firstBrowserApiTestHeaderValue(response.headers, 'content-type')
      )
      const contentLength = parseContentLength(
        firstBrowserApiTestHeaderValue(response.headers, 'content-length')
      )
      const chunks: Buffer[] = []
      let receivedBytes = 0

      const finishOk = (capped: boolean): void => {
        const summary = summarizeBrowserApiTestBody({
          chunks,
          receivedBytes,
          contentLength,
          textual,
          capped
        })
        finish({
          status: 'ok',
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          headers: normalizeBrowserApiTestResponseHeaders(response.headers),
          body: summary.body,
          bodyBytes: summary.bodyBytes,
          truncated: summary.truncated,
          textual,
          durationMs: deps.now() - startedAt
        })
      }

      response.on('data', (chunk) => {
        receivedBytes += chunk.byteLength
        if (receivedBytes > maxBodyBytes) {
          // Resolve with what we have, then stop the transfer; the abort event finds us settled.
          finishOk(true)
          activeRequest.abort()
          return
        }
        // Not behavioral: the summarizer drops a binary body; buffering it only wastes memory.
        if (textual) {
          chunks.push(chunk)
        }
      })
      response.on('error', (error) => fail('network', error.message))
      response.on('end', () => finishOk(false))
    })

    try {
      for (const [name, value] of Object.entries(args.headers)) {
        activeRequest.setHeader(name, value)
      }
      if (args.body.length > 0 && browserApiTestMethodAllowsBody(args.method)) {
        activeRequest.write(args.body)
      }
      activeRequest.end()
    } catch (error) {
      // A header name the user typed can make setHeader throw in here, where a throw would become
      // a rejection instead of a result and strand the timeout on a request nobody owns.
      fail('network', error instanceof Error ? error.message : String(error))
      activeRequest.abort()
    }
  })

  return {
    result,
    cancel: () => {
      if (settled) {
        return
      }
      request?.abort()
    }
  }
}
