export type RequirementParseStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export type RequirementWorktreeMeta = {
  todoId: string
  prdLink: string | null
  parseStatus: RequirementParseStatus
  parseSessionId: string | null
  parseError: string | null
  updatedAt: string
}

export function buildInitialRequirementMeta(args: {
  todoId: string
  prdLink: string | null
}): RequirementWorktreeMeta {
  const trimmedLink = args.prdLink?.trim() || null
  return {
    todoId: args.todoId,
    prdLink: trimmedLink,
    parseStatus: trimmedLink ? 'pending' : 'skipped',
    parseSessionId: null,
    parseError: null,
    updatedAt: new Date().toISOString()
  }
}

export function buildInitialPrdStubContent(title: string, prdLink: string): string {
  return `# ${title.trim()}\n\nPRD: ${prdLink.trim()}\n`
}
