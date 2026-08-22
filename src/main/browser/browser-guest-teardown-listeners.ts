type BrowserGuestTeardownListener = (browserPageId: string) => void

const listeners = new Set<BrowserGuestTeardownListener>()

// Why: the guest-lifecycle owner must not import feature controllers — a direct import made a
// cycle, since those controllers legitimately need the manager's page-id accessors.
export function onBrowserGuestTeardown(listener: BrowserGuestTeardownListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyBrowserGuestTeardown(browserPageId: string): void {
  for (const listener of listeners) {
    listener(browserPageId)
  }
}
