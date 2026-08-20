export type BrowserHeaderMutation = {
  target: 'request' | 'response'
  op: 'set' | 'remove'
  name: string
  /** Required for 'set', ignored for 'remove'. */
  value?: string
}

export type BrowserNetworkRuleMatch = {
  /** Glob against the full URL. '*' is the only metacharacter. */
  urlPattern: string
  /** Empty or absent matches any method. */
  methods?: string[]
  /** Electron resourceType names. Empty or absent matches any. */
  resourceTypes?: string[]
}

/** Phase C. Carried through the types so the rule shape does not change later. */
export type BrowserNetworkResponseOverride = {
  statusCode: number
  headers: BrowserHeaderMutation[]
  body: string
}

export type BrowserNetworkRule = {
  id: string
  label: string
  enabled: boolean
  match: BrowserNetworkRuleMatch
  headers: BrowserHeaderMutation[]
  responseOverride?: BrowserNetworkResponseOverride
}

export type BrowserNetworkRequestFacts = {
  url: string
  method: string
  resourceType?: string
}

// Why: this runs on every request in the browser, so the pattern language is literal segments
// matched with indexOf — a user-authored regex that backtracks would hang the whole partition.
export function matchesBrowserNetworkUrlPattern(pattern: string, url: string): boolean {
  const segments = pattern.split('*')
  if (segments.length === 1) {
    return url === pattern
  }
  const head = segments[0]
  const tail = segments.at(-1) ?? ''
  if (!url.startsWith(head)) {
    return false
  }
  if (!url.endsWith(tail)) {
    return false
  }
  let cursor = head.length
  for (let index = 1; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    if (segment.length === 0) {
      continue
    }
    const found = url.indexOf(segment, cursor)
    if (found === -1) {
      return false
    }
    cursor = found + segment.length
  }
  return cursor <= url.length - tail.length
}

export function matchesBrowserNetworkRule(
  rule: BrowserNetworkRule,
  facts: BrowserNetworkRequestFacts
): boolean {
  if (!rule.enabled) {
    return false
  }
  if (!matchesBrowserNetworkUrlPattern(rule.match.urlPattern, facts.url)) {
    return false
  }
  const methods = rule.match.methods
  if (methods && methods.length > 0) {
    const method = facts.method.toUpperCase()
    if (!methods.some((candidate) => candidate.toUpperCase() === method)) {
      return false
    }
  }
  const resourceTypes = rule.match.resourceTypes
  if (resourceTypes && resourceTypes.length > 0) {
    if (!facts.resourceType) {
      return false
    }
    if (!resourceTypes.includes(facts.resourceType)) {
      return false
    }
  }
  return true
}

function sanitizeStringList(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) {
    return undefined
  }
  const values = input
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  return values.length > 0 ? values : undefined
}

/** RFC 7230 token. */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

const MAX_URL_PATTERN_LENGTH = 2048

function sanitizeMutation(input: unknown): BrowserHeaderMutation | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const raw = input as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  // Why: this output is spread into Electron webRequest header maps, so a CRLF here forges
  // real headers on a real request — reject rather than mangle.
  if (!HEADER_NAME_PATTERN.test(name)) {
    return null
  }
  // Why: assigning this key hits Object.prototype's accessor and stores nothing — an inert rule.
  if (name.toLowerCase() === '__proto__') {
    return null
  }
  if (raw.target !== undefined && raw.target !== 'request' && raw.target !== 'response') {
    return null
  }
  const target = raw.target === 'response' ? 'response' : 'request'
  if (raw.op === 'remove') {
    return { target, op: 'remove', name }
  }
  if (raw.op !== 'set') {
    return null
  }
  if (typeof raw.value !== 'string' || /[\r\n]/.test(raw.value)) {
    return null
  }
  return { target, op: 'set', name, value: raw.value }
}

function sanitizeResponseOverride(input: unknown): BrowserNetworkResponseOverride | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const raw = input as Record<string, unknown>
  const statusCode = raw.statusCode
  if (typeof statusCode !== 'number' || !Number.isInteger(statusCode)) {
    return null
  }
  if (statusCode < 100 || statusCode > 599) {
    return null
  }
  if (typeof raw.body !== 'string') {
    return null
  }
  return {
    statusCode,
    headers: Array.isArray(raw.headers)
      ? raw.headers
          .map(sanitizeMutation)
          .filter((entry): entry is BrowserHeaderMutation => entry !== null)
      : [],
    body: raw.body
  }
}

/** Rules come from a JSON file on disk and from the renderer, so neither is trusted. */
export function sanitizeBrowserNetworkRule(input: unknown): BrowserNetworkRule | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const raw = input as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id.length === 0) {
    return null
  }
  const match =
    raw.match && typeof raw.match === 'object' ? (raw.match as Record<string, unknown>) : null
  const urlPattern = match && typeof match.urlPattern === 'string' ? match.urlPattern.trim() : ''
  if (urlPattern.length === 0 || urlPattern.length > MAX_URL_PATTERN_LENGTH) {
    return null
  }
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  const rule: BrowserNetworkRule = {
    id,
    label: label.length > 0 ? label : urlPattern,
    // Fail closed: only an absent key or a literal true arms a rule that rewrites requests.
    enabled: raw.enabled === undefined || raw.enabled === true,
    match: {
      urlPattern,
      methods: sanitizeStringList(match?.methods),
      resourceTypes: sanitizeStringList(match?.resourceTypes)
    },
    headers: Array.isArray(raw.headers)
      ? raw.headers
          .map(sanitizeMutation)
          .filter((entry): entry is BrowserHeaderMutation => entry !== null)
      : []
  }
  const responseOverride = sanitizeResponseOverride(raw.responseOverride)
  if (responseOverride) {
    rule.responseOverride = responseOverride
  }
  return rule
}
