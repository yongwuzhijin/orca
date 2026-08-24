import type { BrowserApiTestKeyValueRow } from './browser-api-test-types'

function decodeQueryPart(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    // A half-typed escape like `%zz` throws; showing the raw text beats blanking the field.
    return raw
  }
}

/** Splits a pasted URL into the part the URL field keeps and the rows the params table owns. */
export function splitBrowserApiTestQuery(rawUrl: string): {
  url: string
  params: BrowserApiTestKeyValueRow[]
} {
  const questionAt = rawUrl.indexOf('?')
  if (questionAt === -1) {
    return { url: rawUrl, params: [] }
  }
  const base = rawUrl.slice(0, questionAt)
  const rest = rawUrl.slice(questionAt + 1)
  const hashAt = rest.indexOf('#')
  const query = hashAt === -1 ? rest : rest.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : rest.slice(hashAt)
  const params = query
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const equalsAt = pair.indexOf('=')
      const name = equalsAt === -1 ? pair : pair.slice(0, equalsAt)
      const value = equalsAt === -1 ? '' : pair.slice(equalsAt + 1)
      return { name: decodeQueryPart(name), value: decodeQueryPart(value), enabled: true }
    })
  return { url: `${base}${hash}`, params }
}

/**
 * Rebuilds the URL that actually gets sent. A query the user left in the URL field is kept and the
 * table's rows are appended, so a paste that never lost focus still sends both halves.
 */
export function applyBrowserApiTestQuery(
  rawUrl: string,
  params: readonly BrowserApiTestKeyValueRow[]
): string {
  const query = params
    .filter((row) => row.enabled && row.name.trim().length > 0)
    .map((row) => `${encodeURIComponent(row.name.trim())}=${encodeURIComponent(row.value)}`)
    .join('&')
  if (query.length === 0) {
    return rawUrl
  }
  const hashAt = rawUrl.indexOf('#')
  const base = hashAt === -1 ? rawUrl : rawUrl.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : rawUrl.slice(hashAt)
  const separator = base.includes('?') ? '&' : '?'
  return `${base}${separator}${query}${hash}`
}
