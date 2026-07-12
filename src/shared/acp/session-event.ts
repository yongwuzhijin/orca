// 渲染层只认这套归一化结构;P3 对话验证直接复用。
export type SessionEvent =
  | { kind: 'agent_message'; text: string }
  | { kind: 'user_message'; text: string }
  | { kind: 'thought'; text: string }
  | {
      kind: 'tool_call'
      toolCallId: string
      title: string
      status?: string
      toolKind?: string
      rawInput?: unknown
      content?: unknown
    }
  | { kind: 'ext'; method: string; params: unknown }

export type PlanEntry = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: string
}

export type PermissionRequestOption = { optionId: string; name: string; kind: string }

export type PermissionRequest = {
  requestId: string
  sessionId: string
  options: PermissionRequestOption[]
  toolCall: { toolCallId: string; title: string; kind?: string }
}

export type MappedUpdate =
  | { type: 'event'; event: SessionEvent }
  | { type: 'plan'; entries: PlanEntry[] }
  | { type: 'ignore' }
