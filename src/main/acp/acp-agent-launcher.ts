import { join } from 'node:path'
import { app } from 'electron'
import type { AcpEngine } from '../../shared/acp/acp-session'
import { resolveClaudeCommand, resolveCliCommand } from '../codex-cli/command'

export type AgentLaunchSpec = {
  command: string
  args: string[]
  env: Record<string, string>
}

export function isMockMode(): boolean {
  return process.env.DMON_ACP_MOCK === '1'
}

// Why: mock agent lives in-repo under tests/; in packaged app it ships in resources.
function mockAgentScriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tests', 'mock-acp-agent.mjs')
    : join(app.getAppPath(), 'tests', 'mock-acp-agent.mjs')
}

function mockSpec(): AgentLaunchSpec {
  return {
    command: process.execPath,
    args: [mockAgentScriptPath()],
    env: { ELECTRON_RUN_AS_NODE: '1' }
  }
}

function claudeSpec(): AgentLaunchSpec {
  const acpEntry = require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js')
  return {
    command: process.execPath,
    args: [acpEntry],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      CLAUDE_CODE_EXECUTABLE: resolveClaudeCommand()
    }
  }
}

function qoderSpec(): AgentLaunchSpec {
  return { command: resolveCliCommand('qoder'), args: ['--acp'], env: {} }
}

// cursor 原生 ACP:二进制 `agent`,子命令 `acp`(沿用 resolveCliCommand 解析路径)。
function cursorSpec(): AgentLaunchSpec {
  return { command: resolveCliCommand('agent'), args: ['acp'], env: {} }
}

export function getAgentLaunchSpec(engine: AcpEngine): AgentLaunchSpec {
  if (isMockMode()) {
    return mockSpec()
  }
  switch (engine) {
    case 'claude':
      return claudeSpec()
    case 'qoder':
      return qoderSpec()
    case 'cursor':
      return cursorSpec()
  }
  const _exhaustive: never = engine
  throw new Error(`Unknown ACP engine: ${String(_exhaustive)}`)
}
