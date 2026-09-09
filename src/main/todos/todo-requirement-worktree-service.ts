import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REQUIREMENT_CLARIFICATION_FILE,
  REQUIREMENT_META_FILE,
  REQUIREMENT_PRD_FILE,
  REQUIREMENT_PRD_LINK_FILE,
  REQUIREMENT_WORKTREE_SUBDIRS,
  joinRequirementClarificationPath,
  joinRequirementWorktreeRoot
} from '../../shared/todo/todo-requirement-worktree-paths'
import {
  buildInitialPrdStubContent,
  buildInitialRequirementMeta
} from '../../shared/todo/todo-requirement-meta'
import type { ClarificationState } from '../../shared/todo/todo-clarification-template'
import {
  parseClarificationState,
  type ParsedClarificationState
} from '../../shared/todo/clarification-state'

export type InitRequirementWorktreeInput = {
  worktreePath: string
  todoId: string
  title: string
  prdLink?: string | null
}

export function initRequirementWorktree(input: InitRequirementWorktreeInput): void {
  const root = joinRequirementWorktreeRoot(input.worktreePath)
  mkdirSync(root, { recursive: true })
  for (const subdir of REQUIREMENT_WORKTREE_SUBDIRS) {
    mkdirSync(join(root, subdir), { recursive: true })
  }

  const meta = buildInitialRequirementMeta({
    todoId: input.todoId,
    prdLink: input.prdLink ?? null
  })
  writeFileSync(join(root, REQUIREMENT_META_FILE), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')

  writeFileSync(
    join(root, REQUIREMENT_CLARIFICATION_FILE),
    `${JSON.stringify({ items: [] }, null, 2)}\n`,
    'utf8'
  )

  const trimmedLink = input.prdLink?.trim()
  if (trimmedLink) {
    writeFileSync(
      join(root, REQUIREMENT_PRD_FILE),
      buildInitialPrdStubContent(input.title, trimmedLink),
      'utf8'
    )
    writeFileSync(join(root, REQUIREMENT_PRD_LINK_FILE), `${trimmedLink}\n`, 'utf8')
  }
}

export function readClarificationState(worktreePath: string): ParsedClarificationState {
  const filePath = joinRequirementClarificationPath(worktreePath)
  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return parseClarificationState(parsed)
  } catch {
    return { state: { items: [] }, parseError: 'clarification.json is missing or invalid JSON.' }
  }
}

export function writeClarificationState(worktreePath: string, state: ClarificationState): void {
  const filePath = joinRequirementClarificationPath(worktreePath)
  mkdirSync(joinRequirementWorktreeRoot(worktreePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
