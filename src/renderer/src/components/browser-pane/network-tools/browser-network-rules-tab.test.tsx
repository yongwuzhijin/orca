// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkRule } from '../../../../../shared/browser-network-rule'
import { BrowserNetworkRulesTab } from './browser-network-rules-tab'

type ArmResult = {
  armed: boolean
  reason?: 'no_guest' | 'unknown_rules' | 'cdp_error'
  armedRuleIds: string[]
}

const RULE: BrowserNetworkRule = {
  id: 'rule-1',
  label: 'staging auth',
  enabled: true,
  match: { urlPattern: 'https://api.example.com/*' },
  headers: [{ target: 'request', op: 'set', name: 'X-Debug', value: '1' }]
}

const api = {
  networkListRules: vi.fn(async (): Promise<BrowserNetworkRule[]> => [RULE]),
  networkSaveRules: vi.fn(async (_args: { rules: BrowserNetworkRule[] }): Promise<boolean> => true),
  networkArmRules: vi.fn(
    async (_args: { browserPageId: string; ruleIds: string[] }): Promise<ArmResult> => ({
      armed: true,
      armedRuleIds: ['rule-1']
    })
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
  for (const fn of Object.values(api)) {
    fn.mockClear()
  }
  Object.assign(window, { api: { browser: api } })
})

afterEach(cleanup)

function lastSavedRules(): BrowserNetworkRule[] {
  const last = api.networkSaveRules.mock.calls.at(-1)
  if (!last) {
    throw new Error('networkSaveRules was never called')
  }
  return last[0].rules
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement
}

describe('BrowserNetworkRulesTab', () => {
  it('lists the saved rules', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    expect(await screen.findByDisplayValue('https://api.example.com/*')).toBeTruthy()
    expect(screen.getByDisplayValue('staging auth')).toBeTruthy()
  })

  it('arms the checked rules for this page only', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.click(screen.getByLabelText('Arm staging auth'))
    fireEvent.click(screen.getByText('Arm'))
    await waitFor(() =>
      expect(api.networkArmRules).toHaveBeenCalledWith({
        browserPageId: 'page-a',
        ruleIds: ['rule-1']
      })
    )
  })

  it('saves a new rule with a blank pattern replaced by a usable default', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.click(screen.getByText('Add rule'))
    await waitFor(() => expect(api.networkSaveRules).toHaveBeenCalled())
    const saved = api.networkSaveRules.mock.calls[0][0] as { rules: BrowserNetworkRule[] }
    expect(saved.rules).toHaveLength(2)
    expect(saved.rules[1].match.urlPattern).toBe('https://*')
  })

  it('deletes a rule and persists the shortened list', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.click(screen.getByLabelText('Delete staging auth'))
    await waitFor(() => expect(api.networkSaveRules).toHaveBeenCalledWith({ rules: [] }))
  })

  it('explains a failed arm instead of showing an armed state that is not real', async () => {
    api.networkArmRules.mockResolvedValueOnce({
      armed: false,
      reason: 'no_guest',
      armedRuleIds: []
    })
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.click(screen.getByLabelText('Arm staging auth'))
    fireEvent.click(screen.getByText('Arm'))
    expect(await screen.findByText(/could not be armed/)).toBeTruthy()
  })

  it('names DevTools as the culprit when CDP attach fails', async () => {
    api.networkArmRules.mockResolvedValueOnce({
      armed: false,
      reason: 'cdp_error',
      armedRuleIds: []
    })
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.click(screen.getByLabelText('Arm staging auth'))
    fireEvent.click(screen.getByText('Arm'))
    expect(
      await screen.findByText(
        'Rules could not be armed — close DevTools for this tab and try again.'
      )
    ).toBeTruthy()
  })

  it('reaches the response override editor from a rule row', async () => {
    api.networkListRules.mockResolvedValueOnce([
      { ...RULE, responseOverride: { statusCode: 503, headers: [], body: 'down' } }
    ])
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    const status = (await screen.findByLabelText('Status')) as HTMLInputElement
    expect(status.value).toBe('503')
  })

  it('seeds the armed state from main so a remounted tab can still disarm', async () => {
    api.networkReadArmedRules.mockResolvedValueOnce({ armedRuleIds: ['rule-1'] })
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    expect(await screen.findByText('1 armed')).toBeTruthy()
    expect(api.networkReadArmedRules).toHaveBeenCalledWith({ browserPageId: 'page-a' })
    expect(button('Disarm').disabled).toBe(false)
  })

  it('drops the deleted rule from the checked and armed ids', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.click(screen.getByLabelText('Arm staging auth'))
    fireEvent.click(button('Arm'))
    await screen.findByText('1 armed')
    fireEvent.click(screen.getByLabelText('Delete staging auth'))
    await waitFor(() => expect(screen.queryByText('1 armed')).toBeNull())
    expect(button('Arm').disabled).toBe(true)
    expect(button('Disarm').disabled).toBe(true)
  })

  it('explains a failed load instead of claiming there are no rules', async () => {
    api.networkListRules.mockRejectedValueOnce(new Error('ipc down'))
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    expect(await screen.findByText('Rules could not be loaded.')).toBeTruthy()
    expect(screen.queryByText(/No rules yet/)).toBeNull()
  })

  it('blocks adding a rule until the saved list has loaded', async () => {
    let release: (rules: BrowserNetworkRule[]) => void = () => {}
    api.networkListRules.mockReturnValueOnce(
      new Promise<BrowserNetworkRule[]>((resolve) => {
        release = resolve
      })
    )
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    expect(button('Add rule').disabled).toBe(true)
    release([RULE])
    await screen.findByDisplayValue('staging auth')
    expect(button('Add rule').disabled).toBe(false)
  })

  it('saves an edited rule label', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.change(screen.getByLabelText('Rule label'), { target: { value: 'prod auth' } })
    await waitFor(() => expect(api.networkSaveRules).toHaveBeenCalled())
    expect(lastSavedRules()[0].label).toBe('prod auth')
  })

  it('saves an edited url pattern', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.change(screen.getByLabelText('URL pattern'), {
      target: { value: 'https://prod.example.com/*' }
    })
    await waitFor(() => expect(api.networkSaveRules).toHaveBeenCalled())
    expect(lastSavedRules()[0].match.urlPattern).toBe('https://prod.example.com/*')
  })

  it('saves an edited header value without dropping the rest of the mutation', async () => {
    render(<BrowserNetworkRulesTab browserPageId="page-a" />)
    await screen.findByDisplayValue('staging auth')
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '2' } })
    await waitFor(() => expect(api.networkSaveRules).toHaveBeenCalled())
    expect(lastSavedRules()[0].headers[0]).toEqual({
      target: 'request',
      op: 'set',
      name: 'X-Debug',
      value: '2'
    })
  })
})
