import { buildBasePrompt, composePrompt } from './todo-base-prompt'
import type { TodoItem } from './todo-item'

export const DESIGN_DOC_SUBDIR = 'design'

// Why: posix separators — this path is both prompt text for the agent and the input to the
// renderer's separator-aware joinPath, which converts `/` for a Windows cwd.
export function designDocDirRelativePath(orcaDirName: string, identifier: string): string {
  return `${orcaDirName}/${DESIGN_DOC_SUBDIR}/${identifier}`
}

// Why: one predicate for every entry path, so a whitespace-only skill cannot mean
// "configured" here and "unset" there — the trimming semantics live with the builder.
export function isDesignStageSkillConfigured(skill: string): boolean {
  return skill.trim().length > 0
}

export function buildDesignStagePrompt(item: TodoItem, skill: string, orcaDirName: string): string {
  const dir = designDocDirRelativePath(orcaDirName, item.identifier)
  const body = composePrompt(
    buildBasePrompt(item),
    `---\nWrite the design documents into ${dir}/ in the workspace.`
  )
  const prefix = skill.trim()
  return prefix ? `${prefix}\n\n${body}` : body
}

// Why: paths only — the agent reads the documents itself; inlining them would blow the prompt up.
export function buildDesignHandoffPrompt(
  item: TodoItem,
  docRelativeNames: readonly string[],
  orcaDirName: string
): string {
  const base = buildBasePrompt(item)
  if (docRelativeNames.length === 0) {
    return base
  }
  const dir = designDocDirRelativePath(orcaDirName, item.identifier)
  const list = docRelativeNames.map((name) => `- ${dir}/${name}`).join('\n')
  return composePrompt(
    base,
    `Implement the approved solution design. The design documents are:\n${list}`
  )
}
