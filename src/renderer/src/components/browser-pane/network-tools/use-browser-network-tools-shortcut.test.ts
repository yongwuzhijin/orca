// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserFindShortcutScope } from '../describe-page/browser-page-types'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'
import { useBrowserNetworkToolsShortcut } from './use-browser-network-tools-shortcut'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { keybindings: Record<string, unknown> }) => unknown) =>
    selector({ keybindings: {} })
}))
vi.mock('@/hooks/useShortcutLabel', () => ({ getShortcutPlatform: () => 'darwin' }))

function Probe({
  browserPageId = 'page-1',
  isActive,
  shortcutScope = 'focused'
}: {
  browserPageId?: string
  isActive: boolean
  shortcutScope?: BrowserFindShortcutScope
}): null {
  useBrowserNetworkToolsShortcut({ browserPageId, isActive, shortcutScope })
  return null
}

function dispatchNetworkToolsChord(target: EventTarget = window): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'n',
    code: 'KeyN',
    metaKey: true,
    altKey: true,
    bubbles: true,
    cancelable: true
  })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function renderOverlayTarget(browserOverlayTabId: string): HTMLElement {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-browser-overlay-tab-id', browserOverlayTabId)
  const child = document.createElement('button')
  overlay.append(child)
  document.body.append(overlay)
  return child
}

beforeEach(() => {
  useBrowserNetworkToolsPanel.getState().close()
})

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

describe('useBrowserNetworkToolsShortcut', () => {
  it('opens the drawer for its own page when the chord fires', () => {
    render(createElement(Probe, { isActive: true }))
    dispatchNetworkToolsChord()
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
  })

  it('swallows the chord so it cannot also reach other handlers', () => {
    render(createElement(Probe, { isActive: true }))
    const event = dispatchNetworkToolsChord()
    expect(event.defaultPrevented).toBe(true)
  })

  it('retargets the chord after the page id changes', () => {
    const { rerender } = render(createElement(Probe, { isActive: true, browserPageId: 'page-1' }))
    rerender(createElement(Probe, { isActive: true, browserPageId: 'page-2' }))
    dispatchNetworkToolsChord()
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-2')
  })

  it('ignores the chord while its scope is inactive', () => {
    render(createElement(Probe, { isActive: false, shortcutScope: 'inactive' }))
    dispatchNetworkToolsChord()
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('ignores an owned-target chord aimed outside its own overlay', () => {
    renderOverlayTarget('page-1')
    const foreign = document.createElement('button')
    document.body.append(foreign)
    render(createElement(Probe, { isActive: true, shortcutScope: 'owned-target' }))
    dispatchNetworkToolsChord(foreign)
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('honors an owned-target chord aimed inside its own overlay', () => {
    const owned = renderOverlayTarget('page-1')
    render(createElement(Probe, { isActive: true, shortcutScope: 'owned-target' }))
    dispatchNetworkToolsChord(owned)
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
  })

  it('releases only its own drawer when a pane deactivates', () => {
    const panes = (page1Active: boolean, page2Active: boolean): ReactElement =>
      createElement(
        'div',
        null,
        createElement(Probe, { key: 'page-1', browserPageId: 'page-1', isActive: page1Active }),
        createElement(Probe, { key: 'page-2', browserPageId: 'page-2', isActive: page2Active })
      )
    const { rerender } = render(panes(true, true))
    act(() => {
      useBrowserNetworkToolsPanel.getState().open('page-1')
    })
    rerender(panes(true, false))
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
    rerender(panes(false, false))
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })
})
