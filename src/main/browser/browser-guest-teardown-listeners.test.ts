import { describe, expect, it, vi } from 'vitest'

import {
  notifyBrowserGuestTeardown,
  onBrowserGuestTeardown
} from './browser-guest-teardown-listeners'

describe('browser guest teardown listeners', () => {
  it('hands the torn-down page id to a registered listener', () => {
    const listener = vi.fn()
    const unsubscribe = onBrowserGuestTeardown(listener)

    try {
      notifyBrowserGuestTeardown('browser-1')

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith('browser-1')
    } finally {
      unsubscribe()
    }
  })

  it('notifies every distinct listener', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = onBrowserGuestTeardown(first)
    const unsubscribeSecond = onBrowserGuestTeardown(second)

    try {
      notifyBrowserGuestTeardown('browser-2')

      expect(first).toHaveBeenCalledWith('browser-2')
      expect(second).toHaveBeenCalledWith('browser-2')
    } finally {
      unsubscribeFirst()
      unsubscribeSecond()
    }
  })

  it('stops notifying once the returned unsubscribe runs', () => {
    const listener = vi.fn()
    const unsubscribe = onBrowserGuestTeardown(listener)

    unsubscribe()
    notifyBrowserGuestTeardown('browser-3')

    expect(listener).not.toHaveBeenCalled()
  })

  // Why: the registrar can run twice, so re-registering the same reference must stay a no-op.
  it('notifies a doubly registered listener once per teardown', () => {
    const listener = vi.fn()
    const unsubscribeFirst = onBrowserGuestTeardown(listener)
    const unsubscribeSecond = onBrowserGuestTeardown(listener)

    try {
      notifyBrowserGuestTeardown('browser-4')

      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      unsubscribeFirst()
      unsubscribeSecond()
    }
  })

  it('does not throw when nothing is listening', () => {
    expect(() => {
      notifyBrowserGuestTeardown('browser-5')
    }).not.toThrow()
  })
})
