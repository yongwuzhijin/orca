export const DMONWORK_WORKTREE_DIR = '.dmonwork_worktree'

export const REQUIREMENT_WORKTREE_SUBDIRS = ['assets', 'specs', 'plans', 'api'] as const

export const REQUIREMENT_META_FILE = '_meta.json'
export const REQUIREMENT_PRD_FILE = 'prd.md'
export const REQUIREMENT_PRD_LINK_FILE = 'prd-link.txt'
export const REQUIREMENT_CLARIFICATION_FILE = 'clarification.json'

function worktreePathSeparator(worktreePath: string): '/' | '\\' {
  if (
    /^[a-zA-Z]:\\/.test(worktreePath) ||
    (worktreePath.includes('\\') && !worktreePath.includes('/'))
  ) {
    return '\\'
  }
  return '/'
}

/** Browser-safe join for worktree-relative paths (no node:path — shared by renderer). */
export function joinWorktreeRelativePath(worktreePath: string, ...segments: string[]): string {
  const sep = worktreePathSeparator(worktreePath)
  const cleanedSegments = segments
    .map((segment) => segment.replace(/^[/\\]+/, '').replace(/[/\\]+$/, ''))
    .filter((segment) => segment.length > 0)
  const base = worktreePath.replace(/[/\\]+$/, '')
  if (cleanedSegments.length === 0) {
    return base
  }
  return [base, ...cleanedSegments].join(sep)
}

export function joinRequirementWorktreeRoot(worktreePath: string): string {
  return joinWorktreeRelativePath(worktreePath, DMONWORK_WORKTREE_DIR)
}

export function joinRequirementMetaPath(worktreePath: string): string {
  return joinWorktreeRelativePath(joinRequirementWorktreeRoot(worktreePath), REQUIREMENT_META_FILE)
}

export function joinRequirementPrdPath(worktreePath: string): string {
  return joinWorktreeRelativePath(joinRequirementWorktreeRoot(worktreePath), REQUIREMENT_PRD_FILE)
}

export function joinRequirementClarificationPath(worktreePath: string): string {
  return joinWorktreeRelativePath(
    joinRequirementWorktreeRoot(worktreePath),
    REQUIREMENT_CLARIFICATION_FILE
  )
}
