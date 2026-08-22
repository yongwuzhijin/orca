const TEXTUAL_EXACT = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/ecmascript',
  'application/x-www-form-urlencoded',
  'application/graphql'
])

// A bare 200 with no content-type is almost always dev-server text; showing it beats "binary".
export function isTextualContentType(value: string | undefined): boolean {
  const mime = (value ?? '').split(';', 1)[0].trim().toLowerCase()
  if (mime.length === 0) {
    return true
  }
  if (mime.startsWith('text/')) {
    return true
  }
  if (mime.endsWith('+json') || mime.endsWith('+xml')) {
    return true
  }
  return TEXTUAL_EXACT.has(mime)
}

export function normalizeBrowserApiTestResponseHeaders(
  headers: Record<string, string | string[]>
): Record<string, string[]> {
  // Why: response headers are remote-controlled, and a literal `__proto__` name would land on the
  // prototype of a plain literal instead of becoming a header.
  const normalized = Object.create(null) as Record<string, string[]>
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue
    }
    normalized[name] = Array.isArray(value) ? value.map(String) : [String(value)]
  }
  return normalized
}

export function firstBrowserApiTestHeaderValue(
  headers: Record<string, string | string[]>,
  name: string
): string | undefined {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) {
      continue
    }
    const first = Array.isArray(value) ? value[0] : value
    return first === undefined ? undefined : String(first)
  }
  return undefined
}

export type BrowserApiTestBodySummary = {
  body: string
  bodyBytes: number
  truncated: boolean
}

export function summarizeBrowserApiTestBody(args: {
  chunks: readonly Uint8Array[]
  receivedBytes: number
  contentLength: number | undefined
  textual: boolean
  capped: boolean
}): BrowserApiTestBodySummary {
  const bodyBytes = args.contentLength ?? args.receivedBytes
  if (!args.textual) {
    return { body: '', bodyBytes, truncated: args.capped }
  }
  // Concatenate before decoding: a UTF-8 sequence can straddle two chunks.
  const body = Buffer.concat(args.chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8')
  return { body, bodyBytes, truncated: args.capped }
}
