// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BrowserNetworkToolsButton } from './browser-network-tools-button'
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

function renderButton(): void {
  render(
    <TooltipProvider>
      <BrowserNetworkToolsButton browserPageId="page-1" />
    </TooltipProvider>
  )
}

function armedButton(): HTMLElement {
  return screen.getByRole('button')
}

describe('BrowserNetworkToolsButton', () => {
  it('stays unhighlighted when nothing is armed', async () => {
    renderButton()
    await waitFor(() =>
      expect(networkReadArmedRules).toHaveBeenCalledWith({ browserPageId: 'page-1' })
    )
    expect(armedButton().getAttribute('data-armed')).toBeNull()
  })

  it('highlights while a rule is armed so the rewriting is never invisible', async () => {
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    renderButton()
    await waitFor(() => expect(armedButton().getAttribute('data-armed')).toBe('true'))
    expect(armedButton().className).toContain('text-amber-600')
  })

  it('re-reads the arm state when the drawer opens', async () => {
    renderButton()
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalledTimes(1))
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    act(() => {
      useBrowserNetworkToolsPanel.getState().open('page-1')
    })
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(armedButton().getAttribute('data-armed')).toBe('true'))
  })

  it('drops the highlight instead of crashing when the read fails', async () => {
    networkReadArmedRules.mockRejectedValueOnce(new Error('ipc down'))
    renderButton()
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalled())
    expect(armedButton().getAttribute('data-armed')).toBeNull()
  })

  it('names the armed state so the highlight is not the only signal', async () => {
    networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    renderButton()
    await waitFor(() =>
      expect(armedButton().getAttribute('aria-label')).toContain('rewriting requests')
    )
  })

  it('falls back to the plain tools name while idle', async () => {
    renderButton()
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalled())
    expect(armedButton().getAttribute('aria-label')).toBe('Network tools')
  })

  it('toggles the drawer for its own page', async () => {
    renderButton()
    await waitFor(() => expect(networkReadArmedRules).toHaveBeenCalled())
    act(() => {
      armedButton().click()
    })
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBe('page-1')
    act(() => {
      armedButton().click()
    })
    expect(useBrowserNetworkToolsPanel.getState().openPageId).toBeNull()
  })

  it('drops a stale read that a newer one already superseded', async () => {
    const first = createDeferredArmedRulesRead()
    const second = createDeferredArmedRulesRead()
    networkReadArmedRules.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    renderButton()
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
    expect(armedButton().getAttribute('data-armed')).toBeNull()
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
