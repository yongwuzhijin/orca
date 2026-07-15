import type { SessionEvent } from '../../../../../shared/acp/session-event'

type ToolCallEvent = Extract<SessionEvent, { kind: 'tool_call' }>

function mergeToolCall(previous: ToolCallEvent, next: ToolCallEvent): ToolCallEvent {
  // Partial lifecycle updates must not erase useful values supplied by an earlier event.
  return {
    ...previous,
    ...(next.title.trim() ? { title: next.title } : {}),
    ...(next.status !== undefined ? { status: next.status } : {}),
    ...(next.toolKind !== undefined ? { toolKind: next.toolKind } : {}),
    ...(next.rawInput !== undefined ? { rawInput: next.rawInput } : {}),
    ...(next.content !== undefined ? { content: next.content } : {})
  }
}

export function buildAcpSessionTimeline(events: SessionEvent[]): SessionEvent[] {
  const timeline: SessionEvent[] = []
  const toolIndexes = new Map<string, number>()

  for (const event of events) {
    const previous = timeline.at(-1)
    if (
      (event.kind === 'agent_message' || event.kind === 'thought') &&
      previous?.kind === event.kind
    ) {
      timeline[timeline.length - 1] = { ...previous, text: previous.text + event.text }
      continue
    }
    if (event.kind === 'tool_call' && event.toolCallId) {
      const index = toolIndexes.get(event.toolCallId)
      if (index !== undefined) {
        timeline[index] = mergeToolCall(timeline[index] as ToolCallEvent, event)
        continue
      }
      toolIndexes.set(event.toolCallId, timeline.length)
    }
    timeline.push(event)
  }
  return timeline
}
