import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'
import { createBrowserNetworkOverrideSessions } from './browser-network-override-sessions'

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

describe('createBrowserNetworkOverrideSessions', () => {
  const update = vi.fn(async () => {})
  const close = vi.fn()
  const start = vi.fn(async () => ({ update, close }))
  const resolveWebContents = vi.fn(() => ({}) as never)

  beforeEach(() => {
    vi.clearAllMocks()
    update.mockImplementation(async () => {})
    start.mockImplementation(async () => ({ update, close }))
    resolveWebContents.mockImplementation(() => ({}) as never)
  })

  const make = () => createBrowserNetworkOverrideSessions({ resolveWebContents, start })

  it('does not start a session when no rule carries an override', async () => {
    const sessions = make()
    expect(await sessions.sync('page-1', [makeRule({ responseOverride: undefined })])).toEqual({
      ok: true
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('starts a session for a rule with an override', async () => {
    const sessions = make()
    expect(await sessions.sync('page-1', [makeRule()])).toEqual({ ok: true })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('updates instead of restarting an existing session', async () => {
    const sessions = make()
    await sessions.sync('page-1', [makeRule()])
    await sessions.sync('page-1', [makeRule({ match: { urlPattern: 'https://b.test/*' } })])
    expect(start).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('closes the session when the last override goes away', async () => {
    const sessions = make()
    await sessions.sync('page-1', [makeRule()])
    expect(await sessions.sync('page-1', [makeRule({ responseOverride: undefined })])).toEqual({
      ok: true
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('keeps one session per page', async () => {
    const sessions = make()
    await sessions.sync('page-1', [makeRule()])
    await sessions.sync('page-2', [makeRule()])
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('reports a resolve miss without starting', async () => {
    resolveWebContents.mockImplementation(() => null as never)
    const sessions = make()
    const result = await sessions.sync('page-1', [makeRule()])
    expect(result.ok).toBe(false)
    expect(start).not.toHaveBeenCalled()
  })

  it('reports the start failure message and keeps no session', async () => {
    start.mockImplementation(async () => {
      throw new Error('DevTools is open')
    })
    const sessions = make()
    expect(await sessions.sync('page-1', [makeRule()])).toEqual({
      ok: false,
      message: 'DevTools is open'
    })
    start.mockImplementation(async () => ({ update, close }))
    await sessions.sync('page-1', [makeRule()])
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('closes and forgets a session when update fails, so the next sync restarts it', async () => {
    update.mockImplementation(async () => {
      throw new Error('detached')
    })
    const sessions = make()
    await sessions.sync('page-1', [makeRule()])
    expect(await sessions.sync('page-1', [makeRule()])).toEqual({ ok: false, message: 'detached' })
    expect(close).toHaveBeenCalledTimes(1)
    update.mockImplementation(async () => {})
    await sessions.sync('page-1', [makeRule()])
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('closes a live session on close and ignores an unknown page', () => {
    const sessions = make()
    sessions.close('never-armed')
    expect(close).not.toHaveBeenCalled()
  })

  it('closes the session for a page that has one', async () => {
    const sessions = make()
    await sessions.sync('page-1', [makeRule()])
    sessions.close('page-1')
    expect(close).toHaveBeenCalledTimes(1)
    sessions.close('page-1')
    expect(close).toHaveBeenCalledTimes(1)
  })
})
