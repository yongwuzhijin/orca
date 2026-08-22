import { afterEach, describe, expect, it, vi } from 'vitest'
import { installApi } from './web-preload-api-test-harness'

// Why this file exists: the browser stub object is cast with `as unknown as`, so tsc cannot tell
// that a member is missing. Reaching a member that was never stubbed throws in web mode instead of
// degrading, which is what these assertions pin.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('web mode browser network tools', () => {
  it('reports API testing as unavailable rather than throwing', async () => {
    const { api } = await installApi()

    await expect(
      api.browser.networkSendRequest({
        request: {
          browserPageId: 'page-1',
          requestId: 'req-1',
          method: 'GET',
          url: 'https://example.com/api',
          headers: [],
          body: ''
        }
      })
    ).resolves.toEqual({
      status: 'error',
      reason: 'no_guest',
      message: 'API testing is unavailable in the browser client.',
      durationMs: 0
    })
  })

  it('refuses a cancel instead of claiming it aborted something', async () => {
    const { api } = await installApi()

    await expect(api.browser.networkCancelRequest({ requestId: 'req-1' })).resolves.toBe(false)
  })
})
