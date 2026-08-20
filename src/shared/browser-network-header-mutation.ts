import type { BrowserHeaderMutation } from './browser-network-rule'

// Why: Chromium's header casing is not stable, so a set must clear every variant before writing.
function deleteCasingVariants(headers: Record<string, unknown>, name: string): void {
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key]
    }
  }
}

export function applyRequestHeaderMutations(
  headers: Record<string, string>,
  mutations: BrowserHeaderMutation[]
): void {
  for (const mutation of mutations) {
    if (mutation.target !== 'request') {
      continue
    }
    if (mutation.op === 'remove') {
      deleteCasingVariants(headers, mutation.name)
      continue
    }
    const value = mutation.value
    if (typeof value !== 'string') {
      continue
    }
    deleteCasingVariants(headers, mutation.name)
    headers[mutation.name] = value
  }
}

export function applyResponseHeaderMutations(
  headers: Record<string, string[]>,
  mutations: BrowserHeaderMutation[]
): void {
  for (const mutation of mutations) {
    if (mutation.target !== 'response') {
      continue
    }
    if (mutation.op === 'remove') {
      deleteCasingVariants(headers, mutation.name)
      continue
    }
    const value = mutation.value
    if (typeof value !== 'string') {
      continue
    }
    deleteCasingVariants(headers, mutation.name)
    headers[mutation.name] = [value]
  }
}
