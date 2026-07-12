import { describe, it, expect } from 'vitest'
import { mapSessionUpdate } from './acp-session-event-mapping'

describe('mapSessionUpdate', () => {
  it('maps agent_message_chunk', () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'hi' }
      })
    ).toEqual({ type: 'event', event: { kind: 'agent_message', text: 'hi' } })
  })

  it('maps agent_thought_chunk', () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text: 'mm' }
      })
    ).toEqual({ type: 'event', event: { kind: 'thought', text: 'mm' } })
  })

  it('maps user_message_chunk', () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'q' }
      })
    ).toEqual({ type: 'event', event: { kind: 'user_message', text: 'q' } })
  })

  it('maps tool_call', () => {
    const r = mapSessionUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'tc1',
      title: 'edit',
      status: 'pending',
      kind: 'edit'
    })
    expect(r).toEqual({
      type: 'event',
      event: {
        kind: 'tool_call',
        toolCallId: 'tc1',
        title: 'edit',
        status: 'pending',
        toolKind: 'edit',
        rawInput: undefined,
        content: undefined
      }
    })
  })

  it('maps standard plan entries', () => {
    expect(
      mapSessionUpdate({
        sessionUpdate: 'plan',
        entries: [{ content: 'a', status: 'pending', priority: 'high' }]
      })
    ).toEqual({ type: 'plan', entries: [{ content: 'a', status: 'pending', priority: 'high' }] })
  })

  it('maps cursor update_todos (synthesized plan with todos)', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'plan', todos: [{ content: 'x', status: 'in_progress' }] })
    ).toEqual({ type: 'plan', entries: [{ content: 'x', status: 'in_progress' }] })
  })

  it('maps ext (cursor/task)', () => {
    expect(
      mapSessionUpdate({ sessionUpdate: 'ext', method: 'cursor/task', params: { title: 't' } })
    ).toEqual({
      type: 'event',
      event: { kind: 'ext', method: 'cursor/task', params: { title: 't' } }
    })
  })

  it('ignores current_mode_update', () => {
    expect(mapSessionUpdate({ sessionUpdate: 'current_mode_update' })).toEqual({ type: 'ignore' })
  })
})
