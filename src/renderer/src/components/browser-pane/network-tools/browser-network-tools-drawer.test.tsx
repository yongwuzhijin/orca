// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserNetworkToolsDrawer } from './browser-network-tools-drawer'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

const api = {
  networkListRules: vi.fn(async (): Promise<never[]> => []),
  networkSaveRules: vi.fn(async (_args: { rules: unknown[] }): Promise<boolean> => true),
  networkArmRules: vi.fn(
    async (_args: {
      browserPageId: string
      ruleIds: string[]
    }): Promise<{ armed: boolean; armedRuleIds: string[] }> => ({ armed: true, armedRuleIds: [] })
  ),
  networkDisarmRules: vi.fn(async (_args: { browserPageId: string }): Promise<boolean> => true),
  networkReadArmedRules: vi.fn(
    async (_args: { browserPageId: string }): Promise<{ armedRuleIds: string[] }> => ({
      armedRuleIds: []
    })
  ),
  networkReadLog: vi.fn(
    async (_args: {
      browserPageId: string
      limit?: number
    }): Promise<{ entries: never[]; truncated: boolean }> => ({ entries: [], truncated: false })
  )
}

beforeEach(() => {
  useBrowserNetworkToolsPanel.getState().close()
  for (const fn of Object.values(api)) {
    fn.mockClear()
  }
  Object.assign(window, { api: { browser: api } })
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
    // Why: a drawer that forwards the wrong id silently shows another tab's rules.
    expect(api.networkReadArmedRules).toHaveBeenCalledWith({ browserPageId: 'page-a' })
  })

  // Radix's TabsTrigger activates on mousedown/focus, not on a bare `click` event, so this needs
  // a full user-event press rather than fireEvent.click.
  it('switches to the log tab', async () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Log' }))
    expect(await screen.findByText('Refresh')).toBeTruthy()
    expect(useBrowserNetworkToolsPanel.getState().tab).toBe('log')
    expect(api.networkReadLog).toHaveBeenCalledWith({ browserPageId: 'page-a', limit: 100 })
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
    const frame = screen.getByRole('region', { name: 'Network tools' }) as HTMLElement
    expect(frame.style.height).toBe('340px')
  })

  // Why: the OS can steal the pointer mid-drag, and without pointercancel the drawer stays stuck
  // in drag mode and resizes on every later pointer move.
  it('stops resizing when the pointer is cancelled mid-drag', () => {
    useBrowserNetworkToolsPanel.getState().open('page-a')
    useBrowserNetworkToolsPanel.getState().setHeightPx(280)
    render(<BrowserNetworkToolsDrawer browserPageId="page-a" browserRuntimeEnvironmentId={null} />)
    fireEvent.pointerDown(screen.getByRole('separator'), { clientY: 500 })
    fireEvent.pointerMove(window, { clientY: 460 })
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(320)
    fireEvent.pointerCancel(window)
    fireEvent.pointerMove(window, { clientY: 380 })
    expect(useBrowserNetworkToolsPanel.getState().heightPx).toBe(320)
  })
})
