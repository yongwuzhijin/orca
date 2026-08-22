import { net, webContents, type Session } from 'electron'
import {
  buildBrowserApiTestHeaderRecord,
  normalizeBrowserApiTestMethod,
  resolveBrowserApiTestTarget
} from '../../shared/browser-api-test-target'
import type {
  BrowserApiTestFailureReason,
  BrowserApiTestRequest,
  BrowserApiTestResponse
} from '../../shared/browser-api-test-types'
import { browserManager } from './browser-manager'
import {
  sendBrowserApiTestRequest,
  type BrowserApiTestClientRequest,
  type BrowserApiTestSendHandle
} from './browser-api-test-sender'

const inFlight = new Map<string, BrowserApiTestSendHandle>()

function failure(reason: BrowserApiTestFailureReason, message: string): BrowserApiTestResponse {
  return { status: 'error', reason, message, durationMs: 0 }
}

function resolveGuestSession(browserPageId: string): Session | null {
  try {
    const guestWebContentsId = browserManager.getGuestWebContentsId(browserPageId)
    if (typeof guestWebContentsId !== 'number') {
      return null
    }
    const guest = webContents.fromId(guestWebContentsId)
    // Mid-teardown contents are still returned by fromId, and every accessor on them throws.
    if (!guest || guest.isDestroyed()) {
      return null
    }
    return guest.session
  } catch {
    // isDestroyed() can lag the native teardown, and then the session getter throws. Letting that
    // escape an async handler rejects the invoke, so the renderer gets an Error where it typed a
    // response and the drawer stays stuck behind its disabled send button.
    return null
  }
}

export async function runBrowserApiTestRequest(
  request: BrowserApiTestRequest
): Promise<BrowserApiTestResponse> {
  const method = normalizeBrowserApiTestMethod(request.method)
  if (!method) {
    return failure('invalid_method', `Unsupported method: ${request.method}`)
  }
  const target = resolveBrowserApiTestTarget(request.url)
  if (!target) {
    return failure('invalid_url', 'Only absolute http and https URLs can be sent.')
  }
  const session = resolveGuestSession(request.browserPageId)
  if (!session) {
    return failure('no_guest', 'This tab has no live page to borrow a session from.')
  }
  if (inFlight.has(request.requestId)) {
    return failure('busy', 'A request with this id is already in flight.')
  }

  const handle = sendBrowserApiTestRequest(
    {
      method,
      url: target.url,
      headers: buildBrowserApiTestHeaderRecord(request.headers),
      body: request.body,
      session
    },
    {
      // Why the cast: net.request's ClientRequest is structurally wider than the slice the
      // sender needs, and keeping the narrow type is what lets the sender test without Electron.
      createRequest: (options) =>
        net.request({
          method: options.method,
          url: options.url,
          session: options.session as Session,
          useSessionCookies: true
        }) as unknown as BrowserApiTestClientRequest,
      now: () => Date.now()
    }
  )
  inFlight.set(request.requestId, handle)
  try {
    return await handle.result
  } finally {
    inFlight.delete(request.requestId)
  }
}

export function cancelBrowserApiTestRequest(requestId: string): boolean {
  const handle = inFlight.get(requestId)
  if (!handle) {
    return false
  }
  handle.cancel()
  return true
}
