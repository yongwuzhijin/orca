import { getStoredRepoSshConnectionId } from '../repo-execution-host'
import type { GitRuntimeOptions } from '../git/git-runtime-options'
import type { Repo } from '../../shared/repo-types'
import { isOrcaDirIgnored } from '../../shared/orca-dir-gitignore-entry'
import { parseOrcaYaml } from '../hooks'
import {
  isIssueCommandIgnoredByGit,
  readIssueCommand,
  writeIssueCommand
} from '../issue-command-file'
import { isENOENT } from '../ipc/filesystem-auth'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import type { IFilesystemProvider } from '../providers/filesystem-provider-contract'
import { isFolderRepo } from '../../shared/repo-kind'
import { joinWorktreeRelativePath } from './runtime-relative-paths'
import type { RuntimeStore } from './runtime-store-contract'
import { assertWslMoveRepoWritable } from '../persistence/moving-wsl-projects/wsl-move-scope-guard'

type RuntimeRepositoryIssueCommandDeps = {
  resolveRepo: (selector: string) => Promise<Repo>
  getWorkspaceOrcaDirName: () => string
  getLocalGitArgs: (repo: Repo) => [] | [GitRuntimeOptions]
  getStore?: () => RuntimeStore | null
}

export class RuntimeRepositoryIssueCommand {
  constructor(private readonly deps: RuntimeRepositoryIssueCommandDeps) {}

  async read(repoSelector: string) {
    const repo = await this.deps.resolveRepo(repoSelector)
    if (isFolderRepo(repo)) {
      return {
        localContent: null,
        sharedContent: null,
        effectiveContent: null,
        localFilePath: '',
        source: 'none' as const
      }
    }
    const orcaDirName = this.deps.getWorkspaceOrcaDirName()
    const connectionId = getStoredRepoSshConnectionId(repo)
    if (!connectionId) {
      return readIssueCommand(repo.path, orcaDirName)
    }
    const issueCommandPath = joinWorktreeRelativePath(repo.path, `${orcaDirName}/issue-command`)
    const fsProvider = getSshFilesystemProvider(connectionId)
    if (!fsProvider) {
      return {
        localContent: null,
        sharedContent: null,
        effectiveContent: null,
        localFilePath: issueCommandPath,
        source: 'none' as const
      }
    }
    const localContent = await readRemoteOverride(fsProvider, issueCommandPath)
    const sharedContent = await readRemoteShared(fsProvider, repo.path)
    const effectiveContent = localContent ?? sharedContent
    return {
      localContent,
      sharedContent,
      effectiveContent,
      localFilePath: issueCommandPath,
      source: localContent
        ? ('local' as const)
        : sharedContent
          ? ('shared' as const)
          : ('none' as const)
    }
  }

  /** Save a private override on its execution host; blank content restores the shared command. */
  async write(repoSelector: string, content: string): Promise<{ ok: true }> {
    const repo = await this.deps.resolveRepo(repoSelector)
    assertWslMoveRepoWritable(this.deps.getStore?.() ?? undefined, repo)
    if (isFolderRepo(repo)) {
      return { ok: true }
    }
    const orcaDirName = this.deps.getWorkspaceOrcaDirName()
    const connectionId = getStoredRepoSshConnectionId(repo)
    if (!connectionId) {
      await writeIssueCommand(
        repo.path,
        orcaDirName,
        content,
        () => this.deps.getLocalGitArgs(repo)[0] ?? {}
      )
      return { ok: true }
    }
    const issueCommandPath = joinWorktreeRelativePath(repo.path, `${orcaDirName}/issue-command`)
    const fsProvider = getSshFilesystemProvider(connectionId)
    if (!fsProvider) {
      return { ok: true }
    }
    const trimmed = content.trim()
    if (!trimmed) {
      await fsProvider.deletePath(issueCommandPath, false).catch((error: unknown) => {
        if (!isENOENT(error)) {
          throw error
        }
      })
      return { ok: true }
    }
    await fsProvider.createDir(joinWorktreeRelativePath(repo.path, orcaDirName))
    if (!(await isIssueCommandIgnoredByGit(repo.path, orcaDirName, connectionId))) {
      await ensureRemoteOrcaDirIgnored(fsProvider, repo.path, orcaDirName)
    }
    await fsProvider.writeFile(issueCommandPath, `${trimmed}\n`)
    return { ok: true }
  }
}

async function readRemoteOverride(
  fsProvider: IFilesystemProvider,
  issueCommandPath: string
): Promise<string | null> {
  try {
    const result = await fsProvider.readFile(issueCommandPath)
    return result.isBinary ? null : result.content.trim() || null
  } catch {
    return null
  }
}

async function readRemoteShared(
  fsProvider: IFilesystemProvider,
  repoPath: string
): Promise<string | null> {
  try {
    const result = await fsProvider.readFile(joinWorktreeRelativePath(repoPath, 'orca.yaml'))
    return result.isBinary ? null : parseOrcaYaml(result.content)?.issueCommand?.trim() || null
  } catch {
    return null
  }
}

async function ensureRemoteOrcaDirIgnored(
  fsProvider: IFilesystemProvider,
  repoPath: string,
  orcaDirName: string
): Promise<void> {
  const gitignorePath = joinWorktreeRelativePath(repoPath, '.gitignore')
  let result: Awaited<ReturnType<IFilesystemProvider['readFile']>>
  try {
    result = await fsProvider.readFile(gitignorePath)
  } catch (error) {
    if (!isENOENT(error)) {
      console.warn('[runtime] Could not inspect remote .gitignore for orca dir', error)
      return
    }
    try {
      await fsProvider.writeFile(gitignorePath, `${orcaDirName}\n`)
    } catch (writeError) {
      console.warn('[runtime] Could not update remote .gitignore to exclude orca dir', writeError)
    }
    return
  }
  if (result.isBinary || isOrcaDirIgnored(result.content, orcaDirName)) {
    return
  }
  const separator = result.content.endsWith('\n') ? '' : '\n'
  try {
    await fsProvider.writeFile(gitignorePath, `${result.content}${separator}${orcaDirName}\n`)
  } catch (writeError) {
    console.warn('[runtime] Could not update remote .gitignore to exclude orca dir', writeError)
  }
}
