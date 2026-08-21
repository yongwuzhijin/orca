// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'
import { useBrowserNetworkToolsShortcut } from './use-browser-network-tools-shortcut'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { keybindings: Record<string, unknown> }) => unknown) =>
    selector({ keybindings: {} })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ getShortcutPlatform: () => 'darwin' }))

function Probe({ isActive }: { isActive: boolean }): null {
  useBrowserNetworkToolsShortcut({ browserPageId: 'page-1', isActive })
  return null
}

function dispatchNetworkToolsChord(): void {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'n',
        code: 'KeyN',
        metaKey: true,
        altKey: true,
        bubbles: true
      })
    )
  })
}

beforeEach(() => {
  useBrowserNetworkToolsPanel.getState().close()
})

afterEach(cleanup)

describe('useBrowserNetworkToolsShortcut', () => {
  it('opens the drawer for its own page when the chord fires', () => {
    render(createElement(Probe, { isActive: true }))
    dispatchNetworkToolsChord()
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
  })

  it('ignores the chord while the tab is inactive', () => {
    render(createElement(Probe, { isActive: false }))
    dispatchNetworkToolsChord()
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('releases an open drawer when the tab is deactivated', () => {
    const { rerender } = render(createElement(Probe, { isActive: true }))
    act(() => {
      useBrowserNetworkToolsPanel.getState().open('page-1')
    })
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
    rerender(createElement(Probe, { isActive: false }))
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })
})
