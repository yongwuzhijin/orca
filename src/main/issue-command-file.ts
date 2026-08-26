// Why: `<orcaDir>/issue-command` is the per-user override; `orca.yaml` is the tracked project default.
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { appendOrcaDirIgnore } from '../shared/orca-dir-gitignore-entry'
import { loadHooks } from './hooks'

const ISSUE_COMMAND_FILENAME = 'issue-command'

export function getIssueCommandFilePath(repoPath: string, orcaDirName: string): string {
  // Why: `join` normalizes the posix-separated multi-segment name to the host separator.
  return join(repoPath, orcaDirName, ISSUE_COMMAND_FILENAME)
}

export function getSharedIssueCommand(repoPath: string): string | null {
  return loadHooks(repoPath)?.issueCommand?.trim() || null
}

export type ResolvedIssueCommand = {
  localContent: string | null
  sharedContent: string | null
  effectiveContent: string | null
  localFilePath: string
  source: 'local' | 'shared' | 'none'
}

/**
 * Resolve the GitHub issue command using local override first, then tracked repo config.
 */
export function readIssueCommand(repoPath: string, orcaDirName: string): ResolvedIssueCommand {
  const filePath = getIssueCommandFilePath(repoPath, orcaDirName)
  let localContent: string | null = null

  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8').trim()
      localContent = content || null
    } catch {
      localContent = null
    }
  }

  const sharedContent = getSharedIssueCommand(repoPath)
  const effectiveContent = localContent ?? sharedContent

  return {
    localContent,
    sharedContent,
    effectiveContent,
    localFilePath: filePath,
    source: localContent ? 'local' : sharedContent ? 'shared' : 'none'
  }
}

/**
 * Write the per-user issue command override to `{repoRoot}/{orcaDirName}/issue-command`.
 * Empty content deletes the override so the shared `orca.yaml` command applies again.
 */
export function writeIssueCommand(repoPath: string, orcaDirName: string, content: string): void {
  const filePath = getIssueCommandFilePath(repoPath, orcaDirName)
  const trimmed = content.trim()

  try {
    if (!trimmed) {
      rmSync(filePath, { force: true })
      return
    }

    const orcaDir = join(repoPath, orcaDirName)
    if (!existsSync(orcaDir)) {
      mkdirSync(orcaDir, { recursive: true })
    }
    ensureOrcaDirIgnored(repoPath, orcaDirName)
    writeFileSync(filePath, `${trimmed}\n`, 'utf-8')
  } catch (err) {
    console.error('[hooks] Failed to write issue command:', err)
    // Why: re-throw so the IPC handler surfaces the write failure to the renderer's .catch().
    throw err
  }
}

/** Ensure the configured directory is in `.gitignore` so it is never committed. */
function ensureOrcaDirIgnored(repoPath: string, orcaDirName: string): void {
  const gitignorePath = join(repoPath, '.gitignore')
  try {
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : ''
    const next = appendOrcaDirIgnore(existing, orcaDirName)
    if (next !== existing) {
      writeFileSync(gitignorePath, next, 'utf-8')
    }
  } catch {
    console.warn(`[hooks] Could not update .gitignore to exclude ${orcaDirName}`)
  }
}
