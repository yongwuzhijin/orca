import type { TuiAgent } from './tui-agent'

// Why: agent types aren't a fixed set (custom agents exist); any non-empty string is
// accepted — well-known names track launchable TuiAgent ids plus the unknown sentinel.
export type WellKnownAgentType = TuiAgent | 'unknown'
export type AgentType = WellKnownAgentType | (string & {})
