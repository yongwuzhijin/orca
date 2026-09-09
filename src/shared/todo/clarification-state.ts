import type {
  ClarificationItem,
  ClarificationItemStatus,
  ClarificationState
} from './todo-clarification-template'

const CLARIFICATION_STATUSES = new Set<ClarificationItemStatus>(['open', 'invalid', 'answered'])

export type ParsedClarificationState = {
  state: ClarificationState
  parseError: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseClarificationItem(value: unknown, index: number): ClarificationItem | null {
  if (!isRecord(value) || typeof value.question !== 'string' || !value.question.trim()) {
    return null
  }
  const statusRaw = value.status
  const status =
    typeof statusRaw === 'string' &&
    CLARIFICATION_STATUSES.has(statusRaw as ClarificationItemStatus)
      ? (statusRaw as ClarificationItemStatus)
      : 'open'
  const now = new Date().toISOString()
  return {
    id:
      typeof value.id === 'string' && value.id.trim()
        ? value.id.trim()
        : `clarification-${index + 1}`,
    question: value.question.trim(),
    context: typeof value.context === 'string' ? value.context : undefined,
    status,
    answer: typeof value.answer === 'string' ? value.answer : undefined,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now
  }
}

export function parseClarificationState(raw: unknown): ParsedClarificationState {
  if (!isRecord(raw)) {
    return { state: { items: [] }, parseError: 'clarification.json must be a JSON object.' }
  }

  const itemsRaw = raw.items
  if (itemsRaw !== undefined && !Array.isArray(itemsRaw)) {
    return { state: { items: [] }, parseError: 'clarification.json "items" must be an array.' }
  }

  const items: ClarificationItem[] = []
  let skipped = 0
  for (const [index, entry] of (itemsRaw ?? []).entries()) {
    const parsed = parseClarificationItem(entry, index)
    if (parsed) {
      items.push(parsed)
    } else {
      skipped += 1
    }
  }

  const state: ClarificationState = {
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : undefined,
    templateId: typeof raw.templateId === 'string' ? raw.templateId : undefined,
    revisedAt: typeof raw.revisedAt === 'string' ? raw.revisedAt : undefined,
    items
  }

  if (skipped > 0) {
    return {
      state,
      parseError: `${skipped} clarification item(s) were skipped due to invalid shape.`
    }
  }

  return { state, parseError: null }
}

export function buildClarificationAgentPrompt(args: {
  templateBody: string
  prdPath: string
  clarificationPath: string
}): string {
  return [
    args.templateBody.trim(),
    '',
    `请阅读 PRD 文件：${args.prdPath}`,
    `将不明确点写入 ${args.clarificationPath}，格式为 JSON：`,
    '{',
    '  "items": [',
    '    { "id": "…", "question": "…", "context": "…", "status": "open" }',
    '  ]',
    '}',
    '每条 question 必须具体；不要编造 PRD 未提及的功能；无效条目不要写入。'
  ].join('\n')
}
