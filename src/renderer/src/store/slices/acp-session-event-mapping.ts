import type { MappedUpdate, PlanEntry } from '../../../../shared/acp/session-event'

type ChunkContent = { type?: string; text?: string }
type RawUpdate = {
  sessionUpdate?: string
  content?: ChunkContent
  toolCallId?: string
  title?: string
  status?: string
  kind?: string
  rawInput?: unknown
  entries?: { content: string; status: string; priority?: string }[]
  todos?: { content: string; status: string; priority?: string }[]
  method?: string
  params?: unknown
}

function textOf(c: ChunkContent | undefined): string {
  return c?.text ?? ''
}

function toPlanEntries(raw: { content: string; status: string; priority?: string }[]): PlanEntry[] {
  return raw.map((e) => ({
    content: e.content,
    status: (e.status as PlanEntry['status']) ?? 'pending',
    ...(e.priority !== undefined ? { priority: e.priority } : {})
  }))
}

// 原始 ACP sessionUpdate → 渲染层归一化结构。cursor 专有(update_todos→plan;
// task/generate_image→ext)已在主进程 client 归一到同一形状,这里统一处理。
export function mapSessionUpdate(update: unknown): MappedUpdate {
  const u = (update ?? {}) as RawUpdate
  switch (u.sessionUpdate ?? '') {
    case 'agent_message_chunk':
      return { type: 'event', event: { kind: 'agent_message', text: textOf(u.content) } }
    case 'agent_thought_chunk':
      return { type: 'event', event: { kind: 'thought', text: textOf(u.content) } }
    case 'user_message_chunk':
      return { type: 'event', event: { kind: 'user_message', text: textOf(u.content) } }
    case 'tool_call':
    case 'tool_call_update':
      return {
        type: 'event',
        event: {
          kind: 'tool_call',
          toolCallId: u.toolCallId ?? '',
          title: u.title ?? '',
          status: u.status,
          toolKind: u.kind,
          rawInput: u.rawInput,
          content: u.content
        }
      }
    case 'plan':
      return { type: 'plan', entries: toPlanEntries(u.entries ?? u.todos ?? []) }
    case 'ext':
      return {
        type: 'event',
        event: { kind: 'ext', method: u.method ?? '', params: u.params }
      }
    default:
      return { type: 'ignore' }
  }
}
