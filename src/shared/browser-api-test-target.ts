import {
  BROWSER_API_TEST_METHODS,
  type BrowserApiTestHeader,
  type BrowserApiTestMethod
} from './browser-api-test-types'

// Why: net.request derives these from the body and the target itself; a caller-supplied value
// either desyncs the framing or lets the panel spoof the Host of an authenticated session.
const CONNECTION_LEVEL_HEADERS = new Set([
  'content-length',
  'host',
  'connection',
  'transfer-encoding'
])

const BODYLESS_METHODS = new Set<BrowserApiTestMethod>(['GET', 'HEAD'])

export type BrowserApiTestTarget = {
  url: string
  protocol: 'http:' | 'https:'
}

export function resolveBrowserApiTestTarget(rawUrl: string): BrowserApiTestTarget | null {
  const trimmed = rawUrl.trim()
  if (trimmed.length === 0) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  return { url: parsed.toString(), protocol: parsed.protocol }
}

export function normalizeBrowserApiTestMethod(raw: string): BrowserApiTestMethod | null {
  const upper = raw.trim().toUpperCase()
  const known = BROWSER_API_TEST_METHODS as readonly string[]
  return known.includes(upper) ? (upper as BrowserApiTestMethod) : null
}

export function browserApiTestMethodAllowsBody(method: BrowserApiTestMethod): boolean {
  return !BODYLESS_METHODS.has(method)
}

export function buildBrowserApiTestHeaderRecord(
  headers: readonly BrowserApiTestHeader[]
): Record<string, string> {
  // Why: a plain literal would route a row literally named `__proto__` into the prototype instead
  // of becoming a header.
  const record = Object.create(null) as Record<string, string>
  for (const header of headers) {
    if (!header.enabled) {
      continue
    }
    const name = header.name.trim()
    if (name.length === 0 || CONNECTION_LEVEL_HEADERS.has(name.toLowerCase())) {
      continue
    }
    record[name] = header.value
  }
  return record
}
