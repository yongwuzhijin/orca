// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserNetworkArmedIndicator } from './browser-network-armed-indicator'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

type ArmedRulesRead = { armedRuleIds: string[] }

const networkReadArmedRules = vi.fn(async (_args: { browserPageId: string }) => ({
  armedRuleIds: [] as string[]
}))

// Why: mockClear leaves queued *Once values behind, so an unconsumed one bleeds into the next test.
beforeEach(() => {
  networkReadArmedRules.mockReset()
  networkReadArmedRules.mockImplementation(async () => ({ armedRuleIds: [] }))
  useBrowserNetworkToolsPanel.getState().close()
  Object.assign(window, { api: { browser: { networkReadArmedRules } } })
})

afterEach(cleanup)

describe('BrowserNetworkArmedIndicator', () => {
  it('stays invisible when nothing is armed', async () => {
    const { container } = render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    await waitFor(() =>
      expect(networkReadArmedRules).toHaveBeenCalledWith({ browserPageId: 'page-1' })
    )
    expect(container.textContent).toBe('')
  })

  it('shows the badge while a rule is armed so the rewriting is never invisible', async () => {
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    expect(await screen.findByText('NET')).toBeTruthy()
  })

  it('re-reads the arm state when the drawer opens', async () => {
    render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalledTimes(1))
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    useBrowserNetworkToolsPanel.getState().open('page-1')
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('NET')).toBeTruthy()
  })

  it('hides the badge instead of crashing when the read fails', async () => {
    networkReadArmedRules.mockRejectedValueOnce(new Error('ipc down'))
    const { container } = render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('describes why the badge is there so it is not a bare glyph', async () => {
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    const badge = await screen.findByText('NET')
    expect(badge.getAttribute('title')).toContain('rewriting requests')
  })

  it('announces the badge to assistive tech', async () => {
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    const badge = await screen.findByText('NET')
    expect(badge.getAttribute('role')).toBe('status')
  })

  it('drops a stale read that a newer one already superseded', async () => {
    const first = createDeferredArmedRulesRead()
    const second = createDeferredArmedRulesRead()
    networkReadArmedRules.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { container } = render(<BrowserNetworkArmedIndicator browserPageId="page-1" />)
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalledTimes(1))
    act(() => {
      useBrowserNetworkToolsPanel.getState().open('page-1')
    })
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalledTimes(2))
    await act(async () => {
      second.resolve({ armedRuleIds: [] })
    })
    await act(async () => {
      first.resolve({ armedRuleIds: ['rule-1'] })
    })
    expect(container.textContent).toBe('')
  })
})

function createDeferredArmedRulesRead(): {
  promise: Promise<ArmedRulesRead>
  resolve: (value: ArmedRulesRead) => void
} {
  let resolve: (value: ArmedRulesRead) => void = () => {}
  const promise = new Promise<ArmedRulesRead>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve: (value) => resolve(value) }
}
