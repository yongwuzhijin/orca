import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '../../../../../shared/acp/session-event'
import { buildAcpSessionTimeline } from './acp-session-timeline'

describe('buildAcpSessionTimeline', () => {
  it('joins adjacent agent and thought chunks', () => {
    expect(
      buildAcpSessionTimeline([
        { kind: 'agent_message', text: 'Hel' },
        { kind: 'agent_message', text: 'lo' },
        { kind: 'thought', text: 'Check ' },
        { kind: 'thought', text: 'files' }
      ])
    ).toEqual([
      { kind: 'agent_message', text: 'Hello' },
      { kind: 'thought', text: 'Check files' }
    ])
  })

  it('merges a tool lifecycle at its first position', () => {
    const events = buildAcpSessionTimeline([
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        status: 'pending',
        rawInput: { command: 'pnpm test' }
      },
      { kind: 'agent_message', text: 'Running tests' },
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        status: 'completed',
        content: { output: 'PASS' }
      }
    ])
    expect(events).toEqual([
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        status: 'completed',
        rawInput: { command: 'pnpm test' },
        content: { output: 'PASS' }
      },
      { kind: 'agent_message', text: 'Running tests' }
    ])
  })

  it('does not merge tool calls with missing ids', () => {
    const event = { kind: 'tool_call' as const, toolCallId: '', title: 'Unknown' }
    expect(buildAcpSessionTimeline([event, event])).toHaveLength(2)
  })

  it('keeps prior tool fields when later values are undefined or the title is empty', () => {
    expect(
      buildAcpSessionTimeline([
        {
          kind: 'tool_call',
          toolCallId: 'call-1',
          title: 'Bash',
          status: 'pending',
          toolKind: 'execute',
          rawInput: { command: 'pnpm test' }
        },
        {
          kind: 'tool_call',
          toolCallId: 'call-1',
          title: '',
          status: undefined,
          toolKind: undefined,
          content: { output: 'PASS' }
        }
      ])
    ).toEqual([
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        status: 'pending',
        toolKind: 'execute',
        rawInput: { command: 'pnpm test' },
        content: { output: 'PASS' }
      }
    ])
  })

  it('does not mutate input events while aggregating', () => {
    const events: SessionEvent[] = [
      { kind: 'agent_message', text: 'Hel' },
      { kind: 'agent_message', text: 'lo' },
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        rawInput: { command: 'pnpm test' }
      },
      {
        kind: 'tool_call',
        toolCallId: 'call-1',
        title: 'Bash',
        content: { output: 'PASS' }
      }
    ]
    const originalEvents = structuredClone(events)
    const originalReferences = [...events]

    buildAcpSessionTimeline(events)

    expect(events).toEqual(originalEvents)
    expect(events).toEqual(originalReferences)
  })

  it('keeps interleaved tool lifecycles at their first positions', () => {
    expect(
      buildAcpSessionTimeline([
        { kind: 'tool_call', toolCallId: 'call-1', title: 'Bash', status: 'pending' },
        { kind: 'agent_message', text: 'First started' },
        { kind: 'tool_call', toolCallId: 'call-2', title: 'Read', status: 'pending' },
        { kind: 'thought', text: 'Waiting' },
        { kind: 'tool_call', toolCallId: 'call-1', title: 'Bash', status: 'completed' },
        { kind: 'tool_call', toolCallId: 'call-2', title: 'Read', status: 'completed' }
      ])
    ).toEqual([
      { kind: 'tool_call', toolCallId: 'call-1', title: 'Bash', status: 'completed' },
      { kind: 'agent_message', text: 'First started' },
      { kind: 'tool_call', toolCallId: 'call-2', title: 'Read', status: 'completed' },
      { kind: 'thought', text: 'Waiting' }
    ])
  })
})
