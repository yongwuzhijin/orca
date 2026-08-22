import { beforeEach, describe, expect, it } from 'vitest'
import {
  BROWSER_NETWORK_DRAWER_MAX_HEIGHT,
  BROWSER_NETWORK_DRAWER_MIN_HEIGHT,
  useBrowserNetworkToolsPanel
} from './browser-network-tools-panel-state'

const INITIAL = useBrowserNetworkToolsPanel.getState()

beforeEach(() => {
  useBrowserNetworkToolsPanel.setState({
    openPageId: INITIAL.openPageId,
    tab: INITIAL.tab,
    heightPx: INITIAL.heightPx,
    apiPrefill: INITIAL.apiPrefill
  })
})

describe('useBrowserNetworkToolsPanel', () => {
  it('starts closed on the rules tab at a height inside the allowed band', () => {
    expect(INITIAL.openPageId).toBeNull()
    expect(INITIAL.tab).toBe('rules')
    expect(INITIAL.heightPx).toBeGreaterThanOrEqual(BROWSER_NETWORK_DRAWER_MIN_HEIGHT)
    expect(INITIAL.heightPx).toBeLessThanOrEqual(BROWSER_NETWORK_DRAWER_MAX_HEIGHT)
  })

  it('opens for one page at a time, on the rules tab', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.open('page-a')
    store.setTab('log')
    store.open('page-b')
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-b')
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('rules')
  })

  it('clears the open page on close', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.open('page-a')
    store.close()
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('resets the tab on close rather than leaving it to the next open', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.open('page-a')
    store.setTab('log')
    store.close()
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('rules')
  })

  it('keeps a resized height across close and reopen', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.setHeightPx(400)
    store.open('page-a')
    store.close()
    store.open('page-a')
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(400)
  })

  it('reopens on the rules tab so a stale log view is never what you land on', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.open('page-a')
    store.setTab('log')
    store.close()
    store.open('page-a')
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('rules')
  })

  it('switches to the rules tab when toggling over to another page', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.open('page-a')
    store.setTab('log')
    store.toggle('page-b')
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('rules')
  })

  it('toggles closed when the same page is toggled twice', () => {
    const { toggle } = useBrowserNetworkToolsPanel.getState()
    toggle('page-a')
    toggle('page-a')
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('switches pages on toggle rather than closing', () => {
    const { toggle } = useBrowserNetworkToolsPanel.getState()
    toggle('page-a')
    toggle('page-b')
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-b')
  })

  it('clamps the drawer height to the allowed band', () => {
    const { setHeightPx } = useBrowserNetworkToolsPanel.getState()
    setHeightPx(10)
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(BROWSER_NETWORK_DRAWER_MIN_HEIGHT)
    setHeightPx(5000)
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(BROWSER_NETWORK_DRAWER_MAX_HEIGHT)
  })

  it('rounds a fractional height that sits inside the band', () => {
    const { setHeightPx } = useBrowserNetworkToolsPanel.getState()
    setHeightPx(300.6)
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(301)
  })

  it('starts with no api prefill', () => {
    expect(INITIAL.apiPrefill).toBeNull()
  })

  it('opens straight onto the api tab with a prefill', () => {
    useBrowserNetworkToolsPanel.getState().openApiTest('page-a', {
      method: 'POST',
      url: 'https://example.com/api',
      headers: [{ name: 'X-One', value: '1', enabled: true }]
    })

    const state = useBrowserNetworkToolsPanel.getState()

    expect(state.openPageId).toBe('page-a')
    expect(state.tab).toBe('api')
    expect(state.apiPrefill).toEqual({
      method: 'POST',
      url: 'https://example.com/api',
      headers: [{ name: 'X-One', value: '1', enabled: true }]
    })
  })

  // Why: the tab copies the seed into form state, so leaving it parked would stomp later edits
  // on the next mount.
  it('drops the prefill once consumed without disturbing the drawer', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.openApiTest('page-a', { method: 'GET', url: 'https://example.com', headers: [] })
    store.clearApiPrefill()

    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).toBeNull()
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('api')
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-a')
  })

  it('discards a stale prefill when the drawer opens normally', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.openApiTest('page-a', { method: 'GET', url: 'https://example.com', headers: [] })
    store.open('page-a')

    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).toBeNull()
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('rules')
  })

  it('discards a stale prefill on close', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.openApiTest('page-a', { method: 'GET', url: 'https://example.com', headers: [] })
    store.close()

    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).toBeNull()
  })

  it('discards a stale prefill when toggling shut', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.openApiTest('page-a', { method: 'GET', url: 'https://example.com', headers: [] })
    store.toggle('page-a')

    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).toBeNull()
  })

  // Why: toggle has two branches, and only one of them is the close path.
  it('discards a stale prefill when toggling over to another page', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.openApiTest('page-a', { method: 'GET', url: 'https://example.com', headers: [] })
    store.toggle('page-b')

    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-b')
    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).toBeNull()
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('rules')
  })

  it('accepts the api tab from setTab and leaves a pending prefill alone', () => {
    const store = useBrowserNetworkToolsPanel.getState()
    store.openApiTest('page-a', { method: 'GET', url: 'https://example.com', headers: [] })
    store.setTab('log')
    store.setTab('api')

    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('api')
    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).not.toBeNull()
  })
})
