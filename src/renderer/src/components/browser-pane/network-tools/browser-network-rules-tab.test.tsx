// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserNetworkRule } from '../../../../../shared/browser-network-rule'
import { BrowserNetworkRulesTab } from './browser-network-rules-tab'

type ArmResult = {
  armed: boolean
  reason?: 'no_guest' | 'unknown_rules'
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
})
