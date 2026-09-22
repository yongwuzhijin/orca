// Why: `<orcaDir>/issue-command` is the per-user override; `orca.yaml` is the tracked project default.
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { appendOrcaDirIgnore } from '../shared/orca-dir-gitignore-entry'
import { loadHooks } from './hooks'
import type { GitRuntimeOptions } from './git/git-runtime-options'
import { checkIgnoredPaths } from './git/check-ignored-paths'
import { requireSshGitProvider } from './providers/ssh-git-dispatch'

type IssueCommandGitOptions = GitRuntimeOptions | (() => GitRuntimeOptions)

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
export async function writeIssueCommand(
  repoPath: string,
  orcaDirName: string,
  content: string,
  options: IssueCommandGitOptions = {}
): Promise<void> {
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
    if (!(await isIssueCommandIgnoredByGit(repoPath, orcaDirName, undefined, options))) {
      ensureOrcaDirIgnored(repoPath, orcaDirName)
    }
    writeFileSync(filePath, `${trimmed}\n`, 'utf-8')
  } catch (err) {
    console.error('[hooks] Failed to write issue command:', err)
    // Why: re-throw so the IPC handler surfaces the write failure to the renderer's .catch().
    throw err
  }
}

/** Consult the execution host before changing shared ignore rules for a private override. */
export async function isIssueCommandIgnoredByGit(
  repoPath: string,
  orcaDirName: string,
  connectionId?: string,
  options: IssueCommandGitOptions = {}
): Promise<boolean> {
  try {
    const issueCommandPath = `${orcaDirName}/${ISSUE_COMMAND_FILENAME}`
    const ignored = connectionId
      ? await requireSshGitProvider(connectionId).checkIgnoredPaths(repoPath, [issueCommandPath])
      : await checkIgnoredPaths(
          repoPath,
          [issueCommandPath],
          // Runtime repair must not block saving or clearing the local override.
          typeof options === 'function' ? options() : options
        )
    return ignored.includes(issueCommandPath)
  } catch {
    // Preserve the existing ignore-file fallback if Git cannot inspect the rules.
    return false
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
