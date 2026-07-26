import type { BrowserBookmarkLink } from '../../../shared/types'

export function createBrowserBookmarkLinkId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `bookmark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

/** Turns user input into a navigable URL; bare domains get https://. Returns null when unusable. */
export function normalizeBookmarkUrlInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  const candidate = hasScheme ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate).toString()
  } catch {
    return null
  }
}

/** Loose equality so a saved link matches the live page despite a trailing slash. */
export function bookmarkUrlsMatch(a: string, b: string): boolean {
  return stripTrailingSlash(a) === stripTrailingSlash(b)
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

export function buildBrowserBookmarkLink(title: string, url: string): BrowserBookmarkLink {
  return {
    id: createBrowserBookmarkLinkId(),
    title: title.trim() || bookmarkTitleFromUrl(url),
    url,
    createdAt: Date.now()
  }
}

export function bookmarkTitleFromUrl(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}
