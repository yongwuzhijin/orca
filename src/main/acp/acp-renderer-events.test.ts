import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] }
}))

import { broadcastAcpEvent } from './acp-renderer-events'

type FakeWin = {
  destroyed: boolean
  isDestroyed: () => boolean
  webContents: { send: (channel: string, payload: unknown) => void }
}

function makeWin(): { win: FakeWin; sent: [string, unknown][] } {
  const sent: [string, unknown][] = []
  const win: FakeWin = {
    destroyed: false,
    isDestroyed: () => win.destroyed,
    webContents: { send: (c, p) => sent.push([c, p]) }
  }
  return { win, sent }
}

describe('broadcastAcpEvent', () => {
  it('sends to base channel only when no scopeId', () => {
    const a = makeWin()
    broadcastAcpEvent('acp:complete', { sessionId: 's1' }, undefined, () => [a.win as never])
    expect(a.sent).toEqual([['acp:complete', { sessionId: 's1' }]])
  })

  it('sends to base + scoped channel when scopeId given', () => {
    const a = makeWin()
    broadcastAcpEvent('acp:update', { x: 1 }, 'sess-9', () => [a.win as never])
    expect(a.sent).toEqual([
      ['acp:update', { x: 1 }],
      ['acp:update:sess-9', { x: 1 }]
    ])
  })

  it('skips destroyed windows', () => {
    const a = makeWin()
    a.win.destroyed = true
    broadcastAcpEvent('acp:error', { m: 'x' }, undefined, () => [a.win as never])
    expect(a.sent).toEqual([])
  })
})
