import { describe, it, expect, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/repo'
  }
}))

import { getAgentLaunchSpec, isMockMode } from './acp-agent-launcher'

describe('acp-agent-launcher', () => {
  const originalEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('isMockMode reflects DMON_ACP_MOCK', () => {
    delete process.env.DMON_ACP_MOCK
    expect(isMockMode()).toBe(false)
    process.env.DMON_ACP_MOCK = '1'
    expect(isMockMode()).toBe(true)
  })

  it('mock mode returns node running the mock agent script for any engine', () => {
    process.env.DMON_ACP_MOCK = '1'
    const spec = getAgentLaunchSpec('claude')
    expect(spec.command).toBe(process.execPath)
    expect(spec.args.some((a) => a.includes('mock-acp-agent.mjs'))).toBe(true)
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('claude spec uses execPath + claude-agent-acp with ELECTRON_RUN_AS_NODE', () => {
    delete process.env.DMON_ACP_MOCK
    const spec = getAgentLaunchSpec('claude')
    expect(spec.command).toBe(process.execPath)
    expect(spec.args.some((a) => a.includes('claude-agent-acp'))).toBe(true)
    expect(spec.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect('CLAUDE_CODE_EXECUTABLE' in spec.env).toBe(true)
  })

  it('qoder spec uses --acp flag', () => {
    delete process.env.DMON_ACP_MOCK
    const spec = getAgentLaunchSpec('qoder')
    expect(spec.args).toContain('--acp')
  })
})
