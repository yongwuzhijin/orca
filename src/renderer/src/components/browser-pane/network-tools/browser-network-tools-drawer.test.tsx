// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserNetworkToolsDrawer } from './browser-network-tools-drawer'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

beforeEach(() => {
  useBrowserNetworkToolsPanel.getState().close()
  Object.assign(window, {
    api: {
      browser: {
        networkListRules: vi.fn(async () => []),
        networkSaveRules: vi.fn(async () => true),
        networkArmRules: vi.fn(async () => ({ armed: true, armedRuleIds: [] })),
        networkDisarmRules: vi.fn(async () => true),
        networkReadArmedRules: vi.fn(async () => ({ armedRuleIds: [] })),
        networkReadLog: vi.fn(async () => ({ entries: [], truncated: false }))
      }
    }
  })
})

afterEach(cleanup)

describe('BrowserNetworkToolsDrawer', () => {
  it('renders nothing while the panel is closed', () => {
    const { container } = render(
      <BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a page other than the open one', () => {
    useBrowserNetworkToolsPanel.getState().open('page-b')
    const { container } = render(
      <BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the rules tab when opened for its own page', async () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />)
    expect(await screen.findByText('Add rule')).toBeTruthy()
  })

  // Radix's TabsTrigger activates on mousedown/focus, not on a bare `click` event, so this needs
  // a full user-event press rather than fireEvent.click.
  it('switches to the log tab', async () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Log' }))
    expect(await screen.findByText('Refresh')).toBeTruthy()
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('log')
  })

  it('closes from the close button', () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />)
    fireEvent.click(screen.getByLabelText('Close network tools'))
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('states that a remote-runtime tab is unsupported instead of offering rules', () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId="env-1" />)
    expect(screen.getByText(/unavailable for tabs running on a remote host/)).toBeTruthy()
    expect(screen.queryByText('Add rule')).toBeNull()
  })

  it('resizes the drawer by dragging the handle upward and stops on pointerup', () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    useBrowserNetworkToolsPanel.getState().setHeightPx(280)
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />)
    fireEvent.pointerDown(screen.getByRole('separator'), { clientY: 500 })
    fireEvent.pointerMove(window, { clientY: 440 })
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(340)
    fireEvent.pointerUp(window)
    fireEvent.pointerMove(window, { clientY: 300 })
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(340)
  })
})
