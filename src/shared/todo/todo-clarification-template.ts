export type TodoClarificationTemplate = {
  id: string
  name: string
  body: string
  createdAt: string
  updatedAt: string
}

export type CreateTodoClarificationTemplateInput = {
  name: string
  body: string
}

export type UpdateTodoClarificationTemplateInput = {
  id: string
  name?: string
  body?: string
}

export type ClarificationItemStatus = 'open' | 'invalid' | 'answered'

export type ClarificationItem = {
  id: string
  question: string
  context?: string
  status: ClarificationItemStatus
  answer?: string
  createdAt: string
  updatedAt: string
}

export type ClarificationState = {
  sessionId?: string
  templateId?: string
  items: ClarificationItem[]
  revisedAt?: string
}

export const DEFAULT_CLARIFICATION_TEMPLATE_BODY = [
  '阅读 PRD 文件，找出不明确、缺失或相互矛盾之处。',
  '以 JSON 数组输出，每项包含 question 与可选 context 字段。',
  '不要编造需求；只列出 PRD 原文无法直接支撑实现的点。'
].join('\n')
