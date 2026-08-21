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
    heightPx: INITIAL.heightPx
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
})
