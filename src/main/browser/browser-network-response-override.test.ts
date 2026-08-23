import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import {
  BROWSER_OVERRIDE_ATTACH_FAILED,
  overrideRulesOf,
  startBrowserNetworkOverrides
} from './browser-network-response-override'

function makeRule(patch: Partial<BrowserNetworkRule> = {}): BrowserNetworkRule {
  return {
    id: 'rule-1',
    label: 'Rule',
    enabled: true,
    match: { urlPattern: 'https://api.test/*' },
    headers: [],
    responseOverride: { statusCode: 418, headers: [], body: 'teapot' },
    ...patch
  }
}

function makeWebContents(options: { attached?: boolean; attachThrows?: boolean } = {}) {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  let attached = options.attached ?? false
  const sendCommand = vi.fn(
    async (_method: string, _params?: Record<string, unknown>): Promise<unknown> => ({})
  )
  const webContents = {
    isDestroyed: () => false,
    debugger: {
      isAttached: () => attached,
      attach: vi.fn(() => {
        if (options.attachThrows) {
          throw new Error('Another debugger is already attached')
        }
        attached = true
      }),
      detach: vi.fn(() => {
        attached = false
      }),
      sendCommand,
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
      }),
      removeListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== listener)
        )
      })
    }
  }
  return { webContents, sendCommand, listeners }
}

// close() fires Fetch.disable without awaiting it, and sendDebuggerCommand defers the send by a
// microtask, so assertions about it need the queue drained first.
async function flushPendingCommands(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('overrideRulesOf', () => {
  it('keeps only enabled rules that carry an override', () => {
    const kept = makeRule()
    const noOverride = makeRule({ id: 'b', responseOverride: undefined })
    const disabled = makeRule({ id: 'c', enabled: false })
    expect(overrideRulesOf([kept, noOverride, disabled])).toEqual([kept])
  })
})

describe('startBrowserNetworkOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enables Fetch at the response stage with the translated pattern', async () => {
    const { webContents, sendCommand } = makeWebContents()
    await startBrowserNetworkOverrides(webContents as never, [
      makeRule({ match: { urlPattern: 'https://api.test/x?y=1' } })
    ])
    expect(sendCommand).toHaveBeenCalledWith('Fetch.enable', {
      patterns: [{ urlPattern: 'https://api.test/x\\?y=1', requestStage: 'Request' }]
    })
  })

  it('deduplicates identical patterns across rules', async () => {
    const { webContents, sendCommand } = makeWebContents()
    await startBrowserNetworkOverrides(webContents as never, [makeRule(), makeRule({ id: 'b' })])
    expect(sendCommand.mock.calls[0][1]).toEqual({
      patterns: [{ urlPattern: 'https://api.test/*', requestStage: 'Request' }]
    })
  })

  it('registers a message listener', async () => {
    const { webContents, listeners } = makeWebContents()
    await startBrowserNetworkOverrides(webContents as never, [makeRule()])
    expect(listeners.get('message')).toHaveLength(1)
  })

  it('surfaces the DevTools explanation when attach fails', async () => {
    const { webContents } = makeWebContents({ attachThrows: true })
    await expect(startBrowserNetworkOverrides(webContents as never, [makeRule()])).rejects.toThrow(
      BROWSER_OVERRIDE_ATTACH_FAILED
    )
  })

  it('releases the lease and unhooks the listener when Fetch.enable fails', async () => {
    const { webContents, sendCommand, listeners } = makeWebContents()
    sendCommand.mockImplementation(async () => {
      throw new Error('Fetch domain unavailable')
    })
    await expect(startBrowserNetworkOverrides(webContents as never, [makeRule()])).rejects.toThrow(
      'Fetch domain unavailable'
    )
    expect(listeners.get('message')).toHaveLength(0)
    expect(webContents.debugger.detach).toHaveBeenCalled()
  })

  it('re-enables with the new patterns on update', async () => {
    const { webContents, sendCommand } = makeWebContents()
    const session = await startBrowserNetworkOverrides(webContents as never, [makeRule()])
    sendCommand.mockClear()
    await session.update([makeRule({ match: { urlPattern: 'https://other.test/*' } })])
    expect(sendCommand).toHaveBeenCalledWith('Fetch.enable', {
      patterns: [{ urlPattern: 'https://other.test/*', requestStage: 'Request' }]
    })
  })

  it('disables Fetch, unhooks, and detaches on close', async () => {
    const { webContents, sendCommand, listeners } = makeWebContents()
    const session = await startBrowserNetworkOverrides(webContents as never, [makeRule()])
    sendCommand.mockClear()
    session.close()
    await flushPendingCommands()
    expect(sendCommand).toHaveBeenCalledWith('Fetch.disable', {})
    expect(listeners.get('message')).toHaveLength(0)
    expect(webContents.debugger.detach).toHaveBeenCalled()
  })

  it('is safe to close twice', async () => {
    const { webContents, sendCommand } = makeWebContents()
    const session = await startBrowserNetworkOverrides(webContents as never, [makeRule()])
    session.close()
    await flushPendingCommands()
    sendCommand.mockClear()
    session.close()
    await flushPendingCommands()
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('ignores an update after close', async () => {
    const { webContents, sendCommand } = makeWebContents()
    const session = await startBrowserNetworkOverrides(webContents as never, [makeRule()])
    session.close()
    await flushPendingCommands()
    sendCommand.mockClear()
    await session.update([makeRule()])
    await flushPendingCommands()
    expect(sendCommand).not.toHaveBeenCalled()
  })

  it('shows the handler the live rule set after an update', async () => {
    const { webContents, sendCommand, listeners } = makeWebContents()
    const session = await startBrowserNetworkOverrides(webContents as never, [
      makeRule({ responseOverride: { statusCode: 500, headers: [], body: 'stale' } })
    ])
    await session.update([
      makeRule({ responseOverride: { statusCode: 418, headers: [], body: 'fresh' } })
    ])
    sendCommand.mockClear()
    listeners.get('message')?.[0]?.({}, 'Fetch.requestPaused', {
      requestId: 'req-1',
      request: { url: 'https://api.test/thing', method: 'GET' }
    })
    await flushPendingCommands()
    const fulfill = sendCommand.mock.calls.find((call) => call[0] === 'Fetch.fulfillRequest')
    expect(fulfill?.[1]).toMatchObject({ requestId: 'req-1', responseCode: 418 })
  })
})
