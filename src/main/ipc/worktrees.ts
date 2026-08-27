/* oxlint-disable max-lines */
import { app, ipcMain, type BrowserWindow } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Store } from '../persistence'
import { pruneLineageForMissingRepoWorktrees } from '../worktree-lineage-pruning'
import { isFolderRepo } from '../../shared/repo-kind'
import { resolveWorkspaceOrcaDirName } from '../../shared/orca-dir-names'
import { appendOrcaDirIgnore } from '../../shared/orca-dir-gitignore-entry'
import { readBranchRenameFailureOutputForDisplay } from '../agent-hooks/branch-rename-failure-output'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { inspectSetupScriptImportCandidates } from '../../shared/setup-script-imports'
import { planWorktreeSortOrderUpdates } from '../../shared/worktree/sort-order-update'
import { getProjectHostSetupWorktreeMeta } from '../../shared/project-host-setup-projection'
import { TaskSourceContextSchema } from '../../shared/task-source-context-schema'
import { WorkspaceLinkedItemSchema } from '../../shared/workspace-linked-item-schema'
import { isWorkspaceLinkedItemSourceContextMatch } from '../../shared/workspace-linked-item-source-context'
import { getProjectGroupSubtreeIds } from '../../shared/project-groups'
import { projectResolvedWorktreeLineage } from '../../shared/resolved-worktree-lineage'
import { isPathInsideOrEqual, isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'
import { deleteWorktreeHistoryDir } from '../terminal-history-deletion'
import {
  pruneWorkspaceCleanupScanSnapshot,
  pruneWorkspaceCleanupScanSnapshots
} from '../workspace-cleanup-scan-snapshot'
import {
  pruneWorkspaceSpaceAnalysisSnapshot,
  pruneWorkspaceSpaceAnalysisSnapshots
} from '../workspace-space-analysis-snapshot'
import { recordWorkspaceCleanupRemovalSnapshotPrune } from '../workspace-cleanup-removal-snapshot-prune'
import type { OrcaHooks } from '../../shared/orca-yaml-hook-types'
import type { Repo } from '../../shared/repo-types'
import type {
  AdoptProvisionedRootArgs,
  CreateWorktreeArgs,
  CreateWorktreeResult,
  ForceDeleteWorktreeBranchResult,
  RemoveWorktreeResult
} from '../../shared/worktree/create-types'
import type { WorkspaceLineage, WorktreeLineage } from '../../shared/worktree/lineage-types'
import type { WorktreeMeta } from '../../shared/worktree/meta-types'
import type {
  AutomationWorkspaceProvenance,
  CliWorkspaceProvenance,
  DetectedWorktree,
  DetectedWorktreeListResult,
  GitHubPrStartPoint,
  GitPushTarget,
  GitWorktreeInfo,
  Worktree
} from '../../shared/worktree/types'
import { assertWorktreeUnlockedForRemoval } from '../../shared/worktree/removal'
import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toSshExecutionHostId,
  type ExecutionHostId
} from '../../shared/execution-host'
import {
  PROVIDER_REQUEST_ID_MAX_UTF8_BYTES,
  type DirectSshDetectedWorktreeRequest,
  type ForgetRemovedWorktreesForExecutionHostArgs,
  type ForgetRemovedWorktreesForExecutionHostResult,
  type HostQualifiedKnownWorktreeResult,
  type HostQualifiedDetectedWorktreeResult,
  type ListKnownWorktreesForExecutionHostArgs,
  type ListDetectedWorktreesArgs,
  type ProviderRequestId
} from '../../shared/detected-worktree-provider-contract'
import type {
  HostLineageSnapshot,
  ListDesktopLineageForHostArgs
} from '../../shared/host-lineage-contract'
import { isAdmissibleDirectSshAuthority } from '../../shared/ssh-retained-payload-admission'
import {
  applyMetadataFallbackVisibility,
  buildKnownOrcaWorkspaceLayouts,
  isLegacyRepoForExternalWorktreeVisibility,
  toDetectedWorktree
} from '../../shared/worktree/ownership'
import {
  createWorktreeVisibilitySourceMatcher,
  resolveCustomWorktreeVisibilitySources
} from '../../shared/worktree/visibility-sources'
import { resolveConfiguredWorktreeBasePaths } from '../../shared/worktree/configured-worktree-base-path'
import {
  assertWorktreeCleanForRemoval,
  forceDeleteLocalBranch,
  listWorktreesStrict as listGitWorktreesStrict,
  removeWorktree
} from '../git/worktree'
import { gitExecFileAsync } from '../git/runner'
import { withWorktreeRemoveStageSpan, withWorktreeSpan } from '../observability/instrumentation'
import { resolveGitHubPrStartPoint } from '../github/pr-start-point'
import {
  fetchGitHubPullRequestHeadRef,
  fetchPrHeadTrackingRef
} from '../github/pr-head-tracking-ref'
import { pruneWorktreePRRefreshAliases } from '../github/pr-refresh-coordinator'
import { resolveGitHubReviewHeadRemote } from '../github/review-head-remote'
import { listRepoWorktrees } from '../repo-worktrees'
import { getSshGitProvider, requireSshGitProvider } from '../providers/ssh-git-dispatch'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'
import {
  getEffectiveHooks,
  loadHooks,
  parseOrcaYaml,
  runHook,
  hasHooksFile,
  hasUnrecognizedOrcaYamlKeys
} from '../hooks'
import { createIssueCommandRunnerScript, resolveSetupRunnerShell } from '../worktree-runner-script'
import { getSetupRunnerEnvVars } from '../setup-hook-env-vars'
import { getEffectiveHooksFromConfig } from '../effective-hook-config'
import { readIssueCommand, writeIssueCommand } from '../issue-command-file'
import {
  mergeWorktree,
  parseWorktreeId,
  areWorktreePathsEqual,
  formatWorktreeRemovalError,
  isOrphanCompatiblePreflightError,
  isOrphanedWorktreeError
} from './worktree-logic'
import { getRetiredNameRegistryForRepo } from '../worktree-name-retirement'
import { EMPTY_RETIRED_NAME_REGISTRY } from '../../shared/worktree/retired-name-registry'
import { dedupeWorktreesByPath } from './worktree-path-comparison'
import { joinWorktreeRelativePath } from '../runtime/runtime-relative-paths'
import {
  createLocalWorktree,
  createRemoteWorktree,
  cleanupUnusedWorktreePushTargetRemote,
  cleanupUnusedWorktreePushTargetRemoteSsh,
  notifyWorktreesChanged
} from './worktree-remote'
import { registerWorktreeChangeInvalidator } from './worktree-change-invalidators'
import { isENOENT } from './filesystem-path-containment'
import {
  invalidateAuthorizedRootsCache,
  registerWorktreeRootsForRepo
} from './registered-worktree-roots-cache'
import type { OrcaRuntimeService, RuntimeWorktreeLifecycleEvent } from '../runtime/orca-runtime'
import { createSenderScopedRequestCancellations } from './sender-scoped-request-cancellation'
import { registerWorktreeCreateHandlers } from './worktrees/create/register-worktree-create-handlers'
import { registerWorktreePrefetchHandler } from './worktrees/create/register-worktree-prefetch-handler'
import { registerReviewBaseHandlers } from './worktrees/create/register-review-base-handlers'
import { registerWorktreeHookCheckHandler } from './hooks/register-worktree-hook-check-handler'
import { registerWorktreeHookFileHandlers } from './hooks/register-worktree-hook-file-handlers'
import { registerWorktreeHookInspectionHandler } from './hooks/register-worktree-hook-inspection-handler'
import { registerWorktreeHookRunnerHandler } from './hooks/register-worktree-hook-runner-handler'
import { registerDetectedWorktreeHandlers } from './worktrees/listing/register-detected-worktree-handlers'
import { registerHostCatalogHandlers } from './worktrees/listing/register-host-catalog-handlers'
import { registerWorktreeCatalogHandlers } from './worktrees/listing/register-worktree-catalog-handlers'
import { registerDetectedWorktreeScanInvalidation } from './worktrees/listing/register-detected-worktree-scan-invalidation'
import { registerWorktreeMetadataHandlers } from './worktrees/metadata/register-worktree-metadata-handlers'
import { registerWorktreeForgetHandlers } from './worktrees/removal/register-worktree-forget-handlers'
import { registerWorktreeRemovalHandlers } from './worktrees/removal/register-worktree-removal-handlers'
import type { WorktreeIpcContext } from './worktrees/worktree-ipc-context'

registerDetectedWorktreeScanInvalidation()

const WORKTREE_HANDLER_CHANNELS = [
  'worktrees:listAll',
  'worktrees:list',
  'worktrees:listRetiredNames',
  'worktrees:listDetected',
  'worktrees:listKnownForExecutionHost',
  'worktrees:forgetRemovedForExecutionHost',
  'worktrees:cancelListDetected',
  'worktrees:create',
  'worktrees:adoptProvisionedRoot',
  'worktrees:prefetchCreateBase',
  'worktrees:resolvePrBase',
  'worktrees:resolveMrBase',
  'worktrees:remove',
  'worktrees:forgetLocal',
  'worktrees:forceDeletePreservedBranch',
  'worktrees:updateMeta',
  'worktrees:listLineage',
  'worktrees:listLineageForHost',
  'worktrees:updateLineage',
  'worktrees:persistSortOrder',
  'worktrees:getBranchRenameFailureOutput',
  'hooks:check',
  'hooks:inspectSetupScriptImports',
  'hooks:createIssueCommandRunner',
  'hooks:readIssueCommand',
  'hooks:writeIssueCommand'
] as const

export function registerWorktreeHandlers(
  mainWindow: BrowserWindow,
  store: Store,
  runtime: OrcaRuntimeService,
  options?: { onWorktreeLifecycle?: (event: RuntimeWorktreeLifecycleEvent) => void }
): void {
  const context: WorktreeIpcContext = {
    mainWindow,
    store,
    runtime,
    ...(options ? { options } : {}),
    detectedWorktreeCancellations: createSenderScopedRequestCancellations(),
    worktreeRemovalsInFlight: new Map()
  }

  // Remove all stale registrations before installing any replacement handler.
  for (const channel of WORKTREE_HANDLER_CHANNELS) {
    ipcMain.removeHandler(channel)
  }

    // Why: each local repo listing can spawn `git worktree list`; cap fan-out so large fleets don't start unbounded subprocesses.
    const results = await mapWithConcurrency(repos, WORKTREE_LIST_ALL_CONCURRENCY, async (repo) => {
      try {
        let gitWorktrees
        let freshScan = true
        if (isFolderRepo(repo)) {
          return listVisibleFolderWorkspaces(store, repo)
        } else if (repo.connectionId) {
          const provider = getSshGitProvider(repo.connectionId)
          if (!provider) {
            warnOnce(
              loggedUnavailableSshGitProviders,
              `${repo.connectionId}:${repo.id}`,
              `[worktrees] SSH git provider unavailable; skipping worktree list for repo "${repo.displayName}" (${repo.id}) at ${repo.path} on connection ${repo.connectionId}`
            )
            return listDisconnectedSshWorktrees(store, repo, sshWorktreeMetaIndex)
          }
          loggedUnavailableSshGitProviders.delete(`${repo.connectionId}:${repo.id}`)
          try {
            gitWorktrees = await provider.listWorktrees(repo.path)
          } catch (err) {
            warnOnce(
              loggedWorktreeListFailures,
              `${repo.id}:${repo.path}`,
              `[worktrees] failed to list worktrees for repo "${repo.displayName}" (${repo.id}) at ${repo.path}`,
              err
            )
            return listDisconnectedSshWorktrees(store, repo, sshWorktreeMetaIndex)
          }
        } else {
          const scan = await listDetectedGitWorktrees(store, repo)
          gitWorktrees = scan.gitWorktrees
          freshScan = scan.fresh
        }
        if (freshScan) {
          rememberLocalWorktreeRoots(store, repo, gitWorktrees)
          pruneLineageForMissingRepoWorktrees(store, repo, gitWorktrees)
        }
        loggedWorktreeListFailures.delete(`${repo.id}:${repo.path}`)
        return buildDetectedGitWorktrees(store, repo, gitWorktrees)
          .filter((worktree) => worktree.visible)
          .map((worktree) => stampAndMergeVisibleDetectedWorktree(store, repo, worktree))
      } catch (err) {
        warnOnce(
          loggedWorktreeListFailures,
          `${repo.id}:${repo.path}`,
          `[worktrees] failed to list worktrees for repo "${repo.displayName}" (${repo.id}) at ${repo.path}`,
          err
        )
        // Why: do NOT seed empty success — it flags the repo registered, blocking access to legit linked worktrees until the cache is invalidated.
        return []
      }
    })

    return results.flat()
  })

  ipcMain.handle('worktrees:listRetiredNames', async (_event, args: { repoId: string }) => {
    const repo = store.getRepo(args.repoId)
    if (!repo) {
      return EMPTY_RETIRED_NAME_REGISTRY
    }
    return getRetiredNameRegistryForRepo(store, repo, store.getRepos(), store.getSettings())
  })

  ipcMain.handle('worktrees:list', async (_event, args: { repoId: string }) => {
    const repo = store.getRepo(args.repoId)
    if (!repo) {
      return []
    }
    const sshWorktreeMetaIndex = repo.connectionId
      ? createSshWorktreeMetaIndex(Object.entries(store.getAllWorktreeMeta()))
      : new Map()

    try {
      let gitWorktrees
      let freshScan = true
      if (isFolderRepo(repo)) {
        return listVisibleFolderWorkspaces(store, repo)
      } else if (repo.connectionId) {
        const provider = getSshGitProvider(repo.connectionId)
        if (!provider) {
          warnOnce(
            loggedUnavailableSshGitProviders,
            `${repo.connectionId}:${repo.id}`,
            `[worktrees] SSH git provider unavailable; skipping worktree list for repo "${repo.displayName}" (${repo.id}) at ${repo.path} on connection ${repo.connectionId}`
          )
          return listDisconnectedSshWorktrees(store, repo, sshWorktreeMetaIndex)
        }
        loggedUnavailableSshGitProviders.delete(`${repo.connectionId}:${repo.id}`)
        try {
          gitWorktrees = await provider.listWorktrees(repo.path)
        } catch (err) {
          warnOnce(
            loggedWorktreeListFailures,
            `${repo.id}:${repo.path}`,
            `[worktrees] failed to list worktrees for repo "${repo.displayName}" (${repo.id}) at ${repo.path}`,
            err
          )
          return listDisconnectedSshWorktrees(store, repo, sshWorktreeMetaIndex)
        }
      } else {
        const scan = await listDetectedGitWorktrees(store, repo)
        gitWorktrees = scan.gitWorktrees
        freshScan = scan.fresh
      }
      if (freshScan) {
        rememberLocalWorktreeRoots(store, repo, gitWorktrees)
        pruneLineageForMissingRepoWorktrees(store, repo, gitWorktrees)
      }
      loggedWorktreeListFailures.delete(`${repo.id}:${repo.path}`)
      return buildDetectedGitWorktrees(store, repo, gitWorktrees)
        .filter((worktree) => worktree.visible)
        .map((worktree) => stampAndMergeVisibleDetectedWorktree(store, repo, worktree))
    } catch (err) {
      warnOnce(
        loggedWorktreeListFailures,
        `${repo.id}:${repo.path}`,
        `[worktrees] failed to list worktrees for repo "${repo.displayName}" (${repo.id}) at ${repo.path}`,
        err
      )
      // Why: see worktrees:listAll catch — seeding an empty-success result would poison the auth cache and block linked worktrees.
      return []
    }
  })

  ipcMain.handle(
    'worktrees:listKnownForExecutionHost',
    (_event, args: ListKnownWorktreesForExecutionHostArgs): HostQualifiedKnownWorktreeResult => {
      // Why: a malformed invoke must fail closed as `rejected`, not throw out of the handler. `ssh:` is inert —
      // it owns no repo, so every guard below still rejects it.
      const requestedRepoId = args?.repoId ?? ''
      const requestedExecutionHostId = args?.executionHostId ?? 'ssh:'
      const rejected = (): HostQualifiedKnownWorktreeResult => ({
        status: 'rejected',
        repoId: requestedRepoId,
        executionHostId: requestedExecutionHostId
      })
      const parsedHost = parseExecutionHostId(requestedExecutionHostId)
      if (parsedHost?.kind !== 'ssh') {
        return rejected()
      }
      // Why: findExactRepoOwner repeats this same all-candidates-owned check, and getRepos() re-hydrates the
      // whole catalog, so a separate pass here is pure cost.
      const repo = findExactRepoOwner(store, requestedRepoId, requestedExecutionHostId)
      if (!repo || repo.connectionId !== parsedHost.targetId) {
        return rejected()
      }
      const complete = (worktrees: DetectedWorktree[]): HostQualifiedKnownWorktreeResult => ({
        status: 'complete',
        repoId: repo.id,
        executionHostId: requestedExecutionHostId,
        result: {
          repoId: repo.id,
          authoritative: false,
          source: 'metadata-fallback',
          worktrees
        }
      })
      // Why: folder workspace ids carry an instance suffix the git-worktree synthesizer would read as a directory; build them the way every other listing does.
      if (isFolderRepo(repo)) {
        const folderWorkspaceIds = Object.keys(store.getAllWorktreeMeta()).filter((worktreeId) =>
          isFolderWorkspaceIdForRepo(repo, worktreeId)
        )
        return hasConflictingStoredWorktreeOwner(store, repo, folderWorkspaceIds)
          ? rejected()
          : complete(
              // Why: match the authoritative folder listing; without lineage these rows render flat and then
              // reshuffle once the real scan lands.
              projectResolvedWorktreeLineage(
                buildFolderDetectedWorktrees(store, repo),
                store.getAllWorktreeLineage?.() ?? {}
              )
            )
      }
      const metaIndex = createSshWorktreeMetaIndexForRepo(store.getAllWorktreeMeta(), repo.id)
      return complete(
        buildDisconnectedDetectedWorktrees(
          store,
          repo,
          listDisconnectedSshWorktrees(store, repo, metaIndex)
        )
      )
    }
  )

  // Why: gcStaleWorktreeMeta cannot stat a remote path, so SSH metadata outlives the worktree and the fallback
  // above re-lists a worktree deleted outside Orca on every launch. An authoritative scan is the only proof of
  // absence, so the renderer reports what it retired here and the row is dropped like a local GC would.
  ipcMain.handle(
    'worktrees:forgetRemovedForExecutionHost',
    (
      _event,
      args: ForgetRemovedWorktreesForExecutionHostArgs
    ): ForgetRemovedWorktreesForExecutionHostResult => {
      const nothingForgotten: ForgetRemovedWorktreesForExecutionHostResult = {
        forgottenWorktreeIds: []
      }
      const requestedExecutionHostId = args?.executionHostId ?? 'ssh:'
      const worktreeIds = Array.isArray(args?.worktreeIds) ? args.worktreeIds : []
      const parsedHost = parseExecutionHostId(requestedExecutionHostId)
      if (parsedHost?.kind !== 'ssh' || worktreeIds.length === 0) {
        return nothingForgotten
      }
      const repo = findExactRepoOwner(store, args?.repoId ?? '', requestedExecutionHostId)
      if (!repo || repo.connectionId !== parsedHost.targetId) {
        return nothingForgotten
      }
      // Why: a folder workspace's meta IS the workspace record, not a checkout row — gcStaleWorktreeMeta skips
      // those keys for the same reason, and no remote scan can retire one.
      if (isFolderRepo(repo)) {
        return nothingForgotten
      }
      const allMeta = store.getAllWorktreeMeta()
      const forgottenWorktreeIds: string[] = []
      for (const worktreeId of worktreeIds) {
        const meta = typeof worktreeId === 'string' ? allMeta[worktreeId] : undefined
        if (!meta || getRepoIdFromWorktreeId(worktreeId) !== repo.id) {
          continue
        }
        // An unhosted meta belongs to this repo's only owner; a foreign hostId needs that host's own scan.
        if (meta.hostId && meta.hostId !== requestedExecutionHostId) {
          continue
        }
        store.removeWorktreeMeta(worktreeId, requestedExecutionHostId)
        forgottenWorktreeIds.push(worktreeId)
      }
      if (forgottenWorktreeIds.length > 0) {
        const snapshotDirectory = store.getProfileStorageDirectory()
        const targets = forgottenWorktreeIds.map((worktreeId) => ({
          worktreeId,
          executionHostId: requestedExecutionHostId
        }))
        void pruneWorkspaceCleanupScanSnapshots(snapshotDirectory, targets)
        void pruneWorkspaceSpaceAnalysisSnapshots(snapshotDirectory, targets)
      }
      return { forgottenWorktreeIds }
    }
  )

  ipcMain.handle(
    'worktrees:listDetected',
    async (
      event,
      args: DetectedWorktreeRequestArgs
    ): Promise<DetectedWorktreeListResult | HostQualifiedDetectedWorktreeResult> => {
      if ('executionHostId' in args) {
        const parsedHost = parseExecutionHostId(args.executionHostId)
        const directSshRequest = parsedHost?.kind === 'ssh'
        const controller = directSshRequest
          ? detectedWorktreeCancellations.begin(event, args.providerRequestId)
          : null
        const directArgs = args as DirectSshDetectedWorktreeRequest
        const removeAuthorityAbort =
          controller &&
          parsedHost?.kind === 'ssh' &&
          hasValidDirectSshAuthority(directArgs) &&
          directArgs.expectedAuthority.targetId === parsedHost.targetId
            ? registerSshProviderRequestAbort(directArgs.expectedAuthority, controller)
            : undefined
        let timedOut = false
        let removeAbortListener: (() => void) | undefined
        const abortedResult = controller
          ? new Promise<HostQualifiedDetectedWorktreeResult>((resolve) => {
              const onAbort = (): void => {
                resolve({
                  providerRequestId: args.providerRequestId,
                  executionHostId: args.executionHostId,
                  status: timedOut ? 'timed-out' : 'canceled'
                })
              }
              controller.signal.addEventListener('abort', onAbort, { once: true })
              removeAbortListener = () => controller.signal.removeEventListener('abort', onAbort)
            })
          : undefined
        const timeout = controller
          ? setTimeout(() => {
              timedOut = true
              controller.abort()
            }, DETECTED_WORKTREE_PROVIDER_TIMEOUT_MS)
          : undefined
        try {
          const providerResult = listHostQualifiedDetectedWorktrees(
            store,
            args,
            controller
              ? {
                  signal: controller.signal,
                  status: () => (timedOut ? 'timed-out' : 'canceled')
                }
              : undefined
          )
          return abortedResult
            ? await Promise.race([providerResult, abortedResult])
            : await providerResult
        } finally {
          if (timeout) {
            clearTimeout(timeout)
          }
          removeAbortListener?.()
          removeAuthorityAbort?.()
          detectedWorktreeCancellations.finish(event, args.providerRequestId, controller)
        }
      }
      const repo = findExactRepoOwner(store, args.repoId)
      if (!repo) {
        return {
          repoId: args.repoId,
          authoritative: false,
          source: 'metadata-fallback',
          worktrees: []
        }
      }
      const provider = repo.connectionId ? getSshGitProvider(repo.connectionId) : undefined
      const authority = repo.connectionId
        ? { ...getSshProviderAuthority(repo.connectionId) }
        : undefined
      const result = await listDetectedWorktreesForCapturedRepo(
        store,
        repo,
        () =>
          isCapturedRepoCurrent(store, repo) &&
          (!repo.connectionId ||
            (getSshGitProvider(repo.connectionId) === provider &&
              authority !== undefined &&
              isCurrentSshProviderAuthority(authority))),
        provider
      )
      return result && !('providerAbortStatus' in result)
        ? result
        : {
            repoId: repo.id,
            authoritative: false,
            source: 'metadata-fallback',
            worktrees: []
          }
    }
  )
  ipcMain.handle(
    'worktrees:cancelListDetected',
    (event, args: { providerRequestId: ProviderRequestId }): void => {
      detectedWorktreeCancellations.cancel(event, args.providerRequestId)
    }
  )

  ipcMain.handle(
    'worktrees:prefetchCreateBase',
    async (_event, args: { repoId: string; baseBranch?: string }): Promise<void> => {
      const repo = store.getRepo(args.repoId)
      if (!repo) {
        return
      }
      try {
        await prefetchWorktreeCreateBase({ repo, baseBranch: args.baseBranch, runtime })
      } catch {
        // Why: optimistic warm-up; the real create path awaits the same refresh and reports failures there.
      }
    }
  )

  ipcMain.handle(
    'worktrees:create',
    async (_event, rawArgs: CreateWorktreeArgs): Promise<CreateWorktreeResult> => {
      const args = normalizeLinkedWorkItemFields(rawArgs)
      // Why span here: parent the child git spans for the trace tree; don't attach branch name/remote URL (user content) — repo ID is the safer correlator.
      return withWorktreeSpan({ stage: 'create' }, async () => {
        const repo = store.getRepo(args.repoId)
        if (!repo) {
          throw new Error(`Repo not found: ${args.repoId}`)
        }

        const sourceParse = workspaceSourceSchema.safeParse(args.telemetrySource)
        const source: WorkspaceSource = sourceParse.success ? sourceParse.data : 'unknown'

        const automationProvenance = resolveAutomationWorkspaceProvenance({
          authority: runtime,
          repoSelector: args.repoId,
          repo,
          request: args.automationProvenanceRequest
        })
        const createArgs: CreateWorktreeArgsWithSystemProvenance = {
          ...args,
          automationProvenance
        }

        let result: CreateWorktreeResult
        try {
          // Why: wrap only the helpers; the pre-validation throws above are IPC-shape bugs, not the git/filesystem failures the funnel tracks.
          result = isFolderRepo(repo)
            ? createFolderWorkspace(createArgs, repo, store)
            : repo.connectionId
              ? await createRemoteWorktree(createArgs, repo, store, mainWindow)
              : await createLocalWorktree(createArgs, repo, store, mainWindow, runtime)
        } catch (error) {
          releaseAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
          track('workspace_create_failed', {
            source,
            error_class: classifyWorkspaceCreateError(error),
            ...getCohortAtEmit()
          })
          throw error
        }
        finishAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)

        // Why: reaching here means create succeeded (helpers throw); skip a separate workspace_initialized (telemetry-plan.md§Deferred); never send the branch name.
        track('workspace_created', {
          source,
          from_existing_branch:
            !isFolderRepo(repo) &&
            typeof args.baseBranch === 'string' &&
            args.baseBranch.length > 0,
          ...getCohortAtEmit()
        })

        if (isFolderRepo(repo)) {
          notifyWorktreesChanged(mainWindow, repo.id)
        }

        options?.onWorktreeLifecycle?.({
          kind: 'created',
          worktreeId: result.worktree.id,
          path: result.worktree.path,
          branch: result.worktree.branch
        })

        return result
      })
    }
  )

  ipcMain.handle(
    'worktrees:adoptProvisionedRoot',
    async (_event, rawArgs: AdoptProvisionedRootArgs): Promise<CreateWorktreeResult> => {
      const args = normalizeLinkedWorkItemFields(rawArgs)
      return withWorktreeSpan({ stage: 'create' }, async () => {
        const repo = findExactRepoOwner(store, args.repoId, args.executionHostId)
        if (!repo || isFolderRepo(repo)) {
          throw new Error('Provisioned-root repository ownership is missing or ambiguous.')
        }
        const sourceParse = workspaceSourceSchema.safeParse(args.telemetrySource)
        const source: WorkspaceSource = sourceParse.success ? sourceParse.data : 'unknown'
        const automationProvenance = resolveAutomationWorkspaceProvenance({
          authority: runtime,
          repoSelector: args.repoId,
          repo,
          request: args.automationProvenanceRequest
        })
        let result: CreateWorktreeResult
        try {
          result = await adoptProvisionedRootSshCheckout({
            userDataPath: app.getPath('userData'),
            request: { ...args, automationProvenance },
            repo,
            store,
            isRepoCurrent: () => isCapturedRepoCurrent(store, repo, args.executionHostId)
          })
        } catch (error) {
          releaseAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
          track('workspace_create_failed', {
            source,
            error_class: classifyWorkspaceCreateError(error),
            ...getCohortAtEmit()
          })
          throw error
        }
        finishAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
        track('workspace_created', {
          source,
          from_existing_branch: false,
          ...getCohortAtEmit()
        })
        notifyWorktreesChanged(mainWindow, repo.id)
        options?.onWorktreeLifecycle?.({
          kind: 'created',
          worktreeId: result.worktree.id,
          path: result.worktree.path,
          branch: result.worktree.branch
        })
        return result
      })
    }
  )

  ipcMain.handle(
    'worktrees:resolvePrBase',
    async (
      _event,
      args: {
        repoId: string
        prNumber: number
        headRefName?: string
        baseRefName?: string
        isCrossRepository?: boolean
      }
    ): Promise<GitHubPrStartPoint | { error: string }> => {
      const repo = store.getRepo(args.repoId)
      if (!repo) {
        return { error: 'Repo not found' }
      }
      if (isFolderRepo(repo)) {
        return { error: 'Folder mode does not support creating worktrees.' }
      }
      const gitExec = async (args: string[]): Promise<{ stdout: string; stderr: string }> => {
        if (!repo.connectionId) {
          return gitExecFileAsync(args, getLocalProjectGitExecOptions(store, repo))
        }
        const provider = getSshGitProvider(repo.connectionId)
        if (!provider) {
          throw new Error(
            'SSH Git provider is not available. Reconnect to this target and try again.'
          )
        }
        return provider.exec(args, repo.path)
      }
      // Why: SSH review-head fetches require narrow write-capable RPCs.
      const fetchRemoteTrackingRef = (remote: string, branch: string): Promise<void> =>
        fetchPrHeadTrackingRef(
          repo,
          repo.connectionId ? getSshGitProvider(repo.connectionId) : undefined,
          remote,
          branch,
          { localGitExecOptions: getLocalProjectGitExecOptions(store, repo) }
        )
      const fetchPullRequestHeadRef = (remote: string, prNumber: number): Promise<string> =>
        fetchGitHubPullRequestHeadRef(
          repo,
          repo.connectionId ? getSshGitProvider(repo.connectionId) : undefined,
          remote,
          prNumber,
          { localGitExecOptions: getLocalProjectGitExecOptions(store, repo) }
        )

      return resolveGitHubPrStartPoint({
        repoPath: repo.path,
        prNumber: args.prNumber,
        headRefName: args.headRefName,
        baseRefName: args.baseRefName,
        isCrossRepository: args.isCrossRepository,
        issueSourcePreference: repo.issueSourcePreference,
        connectionId: repo.connectionId ?? null,
        localGitOptions: getLocalProjectWorktreeGitOptions(store, repo),
        gitExec,
        fetchRemoteTrackingRef,
        fetchPullRequestHeadRef,
        // Why: one resolver keeps source preference and hosting identity aligned
        // across local, WSL, and SSH worktree creation.
        resolveRemote: () =>
          resolveGitHubReviewHeadRemote({
            repoPath: repo.path,
            issueSourcePreference: repo.issueSourcePreference,
            connectionId: repo.connectionId ?? null,
            localGitOptions: getLocalProjectWorktreeGitOptions(store, repo),
            gitExec
          })
      })
    }
  )

  // Why: keep desktop IPC and mobile/runtime RPC on the same MR-base path so SSH repos don't regress differently per surface.
  ipcMain.handle(
    'worktrees:resolveMrBase',
    async (
      _event,
      args: {
        repoId: string
        mrIid: number
        sourceBranch?: string
        targetBranch?: string
        isCrossRepository?: boolean
      }
    ): Promise<
      | { baseBranch: string; compareBaseRef?: string; pushTarget?: GitPushTarget }
      | { error: string }
    > => {
      return runtime.resolveManagedMrBase({
        repoSelector: `id:${args.repoId}`,
        mrIid: args.mrIid,
        sourceBranch: args.sourceBranch,
        targetBranch: args.targetBranch,
        isCrossRepository: args.isCrossRepository
      })
    }
  )

  const worktreeRemovalsInFlight = new Map<string, WorktreeRemovalInFlight>()

  ipcMain.handle(
    'worktrees:remove',
    async (_event, args: RemoveWorktreeArgs): Promise<RemoveWorktreeResult> => {
      const { repoId, worktreePath } = parseWorktreeId(args.worktreeId)
      const repo = getRepoForWorktreeRemoval(store, repoId, args.hostId)
      if (!repo) {
        throw new Error(`Repo not found: ${repoId}`)
      }
      // The resolved repo supplies host ownership when legacy callers omit args.hostId.
      const removalHostId = getRepoExecutionHostId(repo)
      const inFlightKey = getWorktreeRemovalInFlightKey(args.worktreeId, removalHostId)
      const optionsKey = getWorktreeRemovalOptionsKey(args)
      const inFlightRemoval = worktreeRemovalsInFlight.get(inFlightKey)
      if (inFlightRemoval) {
        if (inFlightRemoval.optionsKey === optionsKey) {
          return inFlightRemoval.promise
        }
        throw new Error(`Worktree deletion already in progress: ${args.worktreeId}`)
      }

      // Why: concurrent stale-toast/double-click/sidebar races can hit the same worktree; share the op so only one path touches Git and disk.
      const removal = (async (): Promise<RemoveWorktreeResult> => {
        // Why: worktree.create is traced; delete freezes were invisible without a matching worktree.remove parent span.
        return withWorktreeSpan({ stage: 'remove', path: worktreePath }, async () => {
          if (isFolderRepo(repo)) {
            if (args.worktreeId === getFolderWorkspaceRootId(repo)) {
              throw new Error(
                'Cannot delete the project root workspace. Remove the folder project instead.'
              )
            }
            const ownerHost = parseExecutionHostId(removalHostId)
            const sshPtyProvider =
              ownerHost?.kind === 'ssh' ? getSshPtyProvider(ownerHost.targetId) : undefined
            // Why: folder workspaces share one root, so there's no Git remove step to close shells; sweep PTYs before dropping metadata.
            await withWorktreeRemoveStageSpan('pty_sweep', 'folder', async () => {
              // Folder projects can be SSH-backed, so fence the sweep to the owning host exactly
              // like the git paths — the local inventory must never reach a remote workspace's id.
              // The resolved repo is authoritative here: path-derived metadata is shared by
              // same-id host copies and can describe a different owner's workspace.
              const externalHost = ownerHost?.kind === 'ssh' || ownerHost?.kind === 'runtime'
              await killAllProcessesForWorktree(args.worktreeId, {
                runtime,
                resolvedWorktreeId: args.worktreeId,
                ...(ownerHost?.kind === 'ssh' ? { resolvedConnectionId: ownerHost.targetId } : {}),
                ...(ownerHost?.kind === 'runtime'
                  ? { resolvedRuntimeEnvironmentId: ownerHost.environmentId }
                  : {}),
                localProvider: sshPtyProvider ?? getLocalPtyProvider(),
                onPtyStopped: clearProviderPtyState,
                ...(externalHost
                  ? {
                      includeProviderInventory:
                        ownerHost?.kind === 'ssh' && Boolean(sshPtyProvider),
                      includeLocalRegistry: false
                    }
                  : {})
              }).catch((err) => {
                console.warn(`[worktree-teardown] failed for ${args.worktreeId}:`, err)
              })
            })
            await withWorktreeRemoveStageSpan('metadata_purge', 'folder', async () => {
              await deleteRemoteWorktreeHistory(sshPtyProvider, args.worktreeId)
              removeWorktreeMetadataAndTransientState(
                store,
                args.worktreeId,
                removalHostId,
                args.snapshotPruneBatchId
              )
            })
            preservedBranchCleanupByScope.delete(
              preservedBranchCleanupScopeKey({ worktreeId: args.worktreeId, hostId: removalHostId })
            )
            notifyWorktreesChanged(mainWindow, repoId)
            return {}
          }

          // Why: renderer-supplied worktreeId embeds a path; re-derive the canonical path from git before any destructive action.
          const provider = repo.connectionId ? requireSshGitProvider(repo.connectionId) : null
          const localWorktreeGitOptions = repo.connectionId
            ? {}
            : getLocalProjectWorktreeGitOptions(store, repo)
          const hasLocalWorktreeGitOptions = Object.keys(localWorktreeGitOptions).length > 0
          const registeredWorktrees = repo.connectionId
            ? await provider!.listWorktrees(repo.path)
            : hasLocalWorktreeGitOptions
              ? await listGitWorktreesStrict(repo.path, localWorktreeGitOptions)
              : await listGitWorktreesStrict(repo.path)
          const removedMeta = resolveWorktreeRemovalMetadata(
            store,
            repoId,
            args.worktreeId,
            removalHostId
          )
          const removedPushTarget = removedMeta?.pushTarget
          const registeredWorktree = findRegisteredDeletableWorktree(
            repo.path,
            worktreePath,
            registeredWorktrees
          )
          if (!registeredWorktree) {
            const fsProvider = repo.connectionId
              ? getSshFilesystemProvider(repo.connectionId)
              : null
            let canCleanOrphanedDirectory = false
            if (
              canCleanupUnregisteredOrcaWorktreeDirectory({
                meta: removedMeta
              })
            ) {
              if (repo.connectionId) {
                if (!fsProvider) {
                  throw new Error('SSH filesystem provider unavailable')
                }
                if (!fsProvider.lstat) {
                  throw new Error('SSH filesystem provider lstat unavailable')
                }
                canCleanOrphanedDirectory = await canSafelyRemoveOrphanedWorktreeDirectory(
                  worktreePath,
                  repo.path,
                  (path) => fsProvider.lstat!(path),
                  (path) => fsProvider.readFile(path)
                )
              } else {
                const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
                canCleanOrphanedDirectory =
                  !isDangerousWorktreeRemovalPath(worktreePath, repo.path) &&
                  (await canSafelyRemoveOrphanedWorktreeDirectory(
                    toLocalWorktreeRuntimePath(worktreePath, localWorktreeGitOptions),
                    toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
                    access.statPath,
                    access.readPath
                  ))
              }
            }
            if (canCleanOrphanedDirectory) {
              assertWorktreeDoesNotContainRegisteredWorktree(worktreePath, registeredWorktrees)
              if (!args.force) {
                throw new Error(ORPHANED_WORKTREE_DIRECTORY_MESSAGE)
              }
              if (repo.connectionId) {
                const removalGate = await runtime.acquireFileWatcherRemoval(
                  worktreePath,
                  repo.connectionId
                )
                let removalCompleted = false
                try {
                  await stopPtysForDestructiveWorktreeRemoval(runtime, args.worktreeId, {
                    connectionId: repo.connectionId,
                    allowUnverifiedStop: args.allowUnverifiedPtyStop
                  })
                  await fsProvider!.deletePath(worktreePath, true)
                  removalCompleted = true
                } finally {
                  await removalGate.finish(removalCompleted)
                }
                // Why history first: the worktree is already gone from git and
                // disk by here, so a rejecting push-target cleanup must not be
                // able to skip history removal and leave the user's commands on
                // the remote host.
                await deleteRemoteWorktreeHistory(
                  getSshPtyProvider(repo.connectionId),
                  args.worktreeId
                )
                await cleanupUnusedWorktreePushTargetRemoteSsh(
                  provider!,
                  repo.path,
                  args.worktreeId,
                  removedPushTarget,
                  store
                )
              } else {
                const removalGate = await runtime.acquireFileWatcherRemoval(worktreePath)
                let removalCompleted = false
                try {
                  await stopPtysForDestructiveWorktreeRemoval(runtime, args.worktreeId, {
                    allowUnverifiedStop: args.allowUnverifiedPtyStop
                  })
                  await removeLocalWorktreePath(worktreePath, localWorktreeGitOptions)
                  removalCompleted = true
                } finally {
                  await removalGate.finish(removalCompleted)
                }
                await cleanupUnusedWorktreePushTargetRemote(
                  repo.path,
                  args.worktreeId,
                  removedPushTarget,
                  store,
                  localWorktreeGitOptions
                )
                invalidateAuthorizedRootsCache()
              }
              runtime.clearOptimisticReconcileToken(args.worktreeId)
              removeWorktreeMetadataAndTransientState(
                store,
                args.worktreeId,
                removalHostId,
                args.snapshotPruneBatchId
              )
              preservedBranchCleanupByScope.delete(
                preservedBranchCleanupScopeKey({
                  worktreeId: args.worktreeId,
                  hostId: removalHostId
                })
              )
              notifyWorktreesChanged(mainWindow, repoId)
              return {}
            }
            if (!repo.connectionId) {
              const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
              const runtimeWorktreePath = toLocalWorktreeRuntimePath(
                worktreePath,
                localWorktreeGitOptions
              )
              if (
                await canCleanupUnregisteredOrcaLeftoverDirectory({
                  meta: removedMeta,
                  worktreePath,
                  runtimeWorktreePath,
                  repo,
                  runtimeRepoPath: toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
                  registeredWorktrees,
                  statPath: access.statPath,
                  isGitRepository: (path) => isLocalGitRepository(path, localWorktreeGitOptions)
                })
              ) {
                if (!args.force) {
                  throw new Error(ORPHANED_WORKTREE_DIRECTORY_MESSAGE)
                }
                const removalGate = await runtime.acquireFileWatcherRemoval(worktreePath)
                let removalCompleted = false
                try {
                  await stopPtysForDestructiveWorktreeRemoval(runtime, args.worktreeId, {
                    allowUnverifiedStop: args.allowUnverifiedPtyStop
                  })
                  await removeLocalWorktreePath(worktreePath, localWorktreeGitOptions)
                  removalCompleted = true
                } finally {
                  await removalGate.finish(removalCompleted)
                }
                await cleanupUnusedWorktreePushTargetRemote(
                  repo.path,
                  args.worktreeId,
                  removedPushTarget,
                  store,
                  localWorktreeGitOptions
                )
                runtime.clearOptimisticReconcileToken(args.worktreeId)
                removeWorktreeMetadataAndTransientState(
                  store,
                  args.worktreeId,
                  removalHostId,
                  args.snapshotPruneBatchId
                )
                preservedBranchCleanupByScope.delete(
                  preservedBranchCleanupScopeKey({
                    worktreeId: args.worktreeId,
                    hostId: removalHostId
                  })
                )
                invalidateAuthorizedRootsCache()
                notifyWorktreesChanged(mainWindow, repoId)
                return {}
              }
            }
            if (await isAlreadyRemovedWorktreePath(repo, worktreePath, localWorktreeGitOptions)) {
              if (!args.force && !removedMeta) {
                // Why: without persisted metadata, require the renderer recovery path before deleting Orca-only state for an unregistered path.
                throw new Error(UNREGISTERED_MISSING_WORKTREE_MESSAGE)
              }
              // Why: a manually deleted worktree is already gone; persisted metadata proves it was an Orca-known row, so no force is needed.
              if (repo.connectionId) {
                // Why history first: the worktree is already gone from git and
                // disk by here, so a rejecting push-target cleanup must not be
                // able to skip history removal and leave the user's commands on
                // the remote host.
                await deleteRemoteWorktreeHistory(
                  getSshPtyProvider(repo.connectionId),
                  args.worktreeId
                )
                await cleanupUnusedWorktreePushTargetRemoteSsh(
                  provider!,
                  repo.path,
                  args.worktreeId,
                  removedPushTarget,
                  store
                )
              } else {
                await cleanupUnusedWorktreePushTargetRemote(
                  repo.path,
                  args.worktreeId,
                  removedPushTarget,
                  store,
                  localWorktreeGitOptions
                )
                invalidateAuthorizedRootsCache()
              }
              runtime.clearOptimisticReconcileToken(args.worktreeId)
              removeWorktreeMetadataAndTransientState(
                store,
                args.worktreeId,
                removalHostId,
                args.snapshotPruneBatchId
              )
              preservedBranchCleanupByScope.delete(
                preservedBranchCleanupScopeKey({
                  worktreeId: args.worktreeId,
                  hostId: removalHostId
                })
              )
              notifyWorktreesChanged(mainWindow, repoId)
              return {}
            }
            throw new Error(`Refusing to delete unregistered worktree path: ${worktreePath}`)
          }
          const canonicalWorktreePath = registeredWorktree.path
          const deleteBranch = removedMeta?.preserveBranchOnDelete !== true

          // Why: a Git lock must block before archive hooks or linked-path cleanup mutate the workspace; dirty-file force is separate.
          try {
            assertWorktreeUnlockedForRemoval(registeredWorktree)
          } catch (error) {
            throw new Error(
              formatWorktreeRemovalError(error, canonicalWorktreePath, args.force ?? false)
            )
          }

          // Why: a prior forced Windows recovery can delete the dir but leave a stale Git registration; verify before clearing metadata.
          if (
            !repo.connectionId &&
            args.force === true &&
            process.platform === 'win32' &&
            (isWindowsAbsolutePathLike(canonicalWorktreePath) ||
              !!localWorktreeGitOptions.wslDistro) &&
            removedMeta &&
            (await isAlreadyRemovedWorktreePath(
              repo,
              canonicalWorktreePath,
              localWorktreeGitOptions
            ))
          ) {
            const removalResult = await removeStaleLocalWorktreeRegistrationAfterFilesystemRemoval({
              canonicalWorktreePath,
              repoPath: repo.path,
              localWorktreeGitOptions,
              registeredWorktree,
              deleteBranch
            })
            await cleanupUnusedWorktreePushTargetRemote(
              repo.path,
              args.worktreeId,
              removedPushTarget,
              store,
              localWorktreeGitOptions
            )
            rememberPreservedBranchCleanupTarget(
              args.worktreeId,
              removalHostId,
              removalResult,
              registeredWorktree.head,
              removedPushTarget
            )
            runtime.clearOptimisticReconcileToken(args.worktreeId)
            removeWorktreeMetadataAndTransientState(
              store,
              args.worktreeId,
              removalHostId,
              args.snapshotPruneBatchId
            )
            invalidateAuthorizedRootsCache()
            notifyWorktreesChanged(mainWindow, repoId)
            return removalResult ?? {}
          }

          // Run archive hook before removal so teardown scripts still see the worktree directory.
          const hooks = await getArchiveHooksForRemoval(repo)
          const archiveScript = hooks?.scripts.archive
          if (archiveScript && !args.skipArchive) {
            // Why the branch on connectionId: this block is shared by both flows, so a hardcoded
            // 'remote' would file every local archive hook under the SSH breakdown.
            await withWorktreeRemoveStageSpan(
              'archive_hook',
              repo.connectionId ? 'remote' : 'local',
              async () => {
                const result = repo.connectionId
                  ? await runRemoteArchiveHook(repo, canonicalWorktreePath, archiveScript)
                  : await runHook(
                      'archive',
                      canonicalWorktreePath,
                      repo,
                      undefined,
                      localWorktreeGitOptions
                    )
                if (!result.success) {
                  console.error(
                    `[hooks] archive hook failed for ${canonicalWorktreePath}:`,
                    result.output
                  )
                }
              }
            )
          }

          const remoteConnectionId = repo.connectionId ?? undefined
          if (remoteConnectionId) {
            // Why: SSH deletion mirrors the local flow — hooks run while the directory is intact, then the clean check guards removal.
            if (!args.force) {
              const { clean, stdout } = await provider!.worktreeIsClean(canonicalWorktreePath)
              if (!clean) {
                const error = new Error('Worktree has uncommitted or untracked changes.')
                ;(error as Error & { stdout?: string }).stdout = stdout
                throw error
              }
            }

            const remoteRemoveOptions = !deleteBranch ? { deleteBranch } : {}
            const removalGate = await withWorktreeRemoveStageSpan(
              'watcher_gate',
              'remote',
              async () =>
                runtime.acquireFileWatcherRemoval(canonicalWorktreePath, remoteConnectionId)
            )
            let rawRemovalResult: RemoveWorktreeResult | undefined
            let removalCompleted = false
            try {
              await withWorktreeRemoveStageSpan('pty_sweep', 'remote', async () => {
                await stopPtysForDestructiveWorktreeRemoval(runtime, args.worktreeId, {
                  connectionId: remoteConnectionId,
                  allowUnverifiedStop: args.allowUnverifiedPtyStop
                })
              })
              rawRemovalResult = await withWorktreeRemoveStageSpan(
                'git_remove',
                'remote',
                async () =>
                  Object.keys(remoteRemoveOptions).length > 0
                    ? provider!.removeWorktree(
                        canonicalWorktreePath,
                        args.force,
                        remoteRemoveOptions
                      )
                    : provider!.removeWorktree(canonicalWorktreePath, args.force)
              )
              removalCompleted = true
            } finally {
              await removalGate.finish(removalCompleted)
            }
            const removalResult = preserveBranchHeadFallback(
              rawRemovalResult,
              registeredWorktree.head
            )
            await cleanupUnusedWorktreePushTargetRemoteSsh(
              provider!,
              repo.path,
              args.worktreeId,
              removedPushTarget,
              store
            )
            await deleteRemoteWorktreeHistory(
              getSshPtyProvider(remoteConnectionId),
              args.worktreeId
            )
            rememberPreservedBranchCleanupTarget(
              args.worktreeId,
              removalHostId,
              removalResult,
              registeredWorktree.head,
              removedPushTarget
            )
            runtime.clearOptimisticReconcileToken(args.worktreeId)
            await withWorktreeRemoveStageSpan('metadata_purge', 'remote', async () => {
              removeWorktreeMetadataAndTransientState(
                store,
                args.worktreeId,
                removalHostId,
                args.snapshotPruneBatchId
              )
            })
            notifyWorktreesChanged(mainWindow, repoId)
            return removalResult ?? {}
          }

          const refreshedWorktrees = hasLocalWorktreeGitOptions
            ? await listGitWorktreesStrict(repo.path, localWorktreeGitOptions)
            : await listGitWorktreesStrict(repo.path)
          const refreshedRegisteredWorktree = findRegisteredDeletableWorktree(
            repo.path,
            canonicalWorktreePath,
            refreshedWorktrees
          )
          if (!refreshedRegisteredWorktree) {
            throw new Error(
              `Worktree registration changed during deletion: ${canonicalWorktreePath}. Retry deletion.`
            )
          }
          try {
            // Why: an archive hook can race another Git client that locks the row; recheck before linked-path/watcher/terminal teardown.
            assertWorktreeUnlockedForRemoval(refreshedRegisteredWorktree)
          } catch (error) {
            throw new Error(
              formatWorktreeRemovalError(error, canonicalWorktreePath, args.force ?? false)
            )
          }

          // Why: `orca.yaml` shared directories are symlinked in too, and a
          // directory-only ignore rule leaves those links untracked, so removal must
          // tolerate and unlink them exactly like the per-user shared paths.
          const linkedPaths = getWorktreeSharedLinkPaths(repo)
          const ignoredLinkedPaths = args.force
            ? []
            : await findExistingWorktreeSymlinkPaths(canonicalWorktreePath, linkedPaths)
          try {
            await (hasLocalWorktreeGitOptions
              ? assertWorktreeCleanForRemoval(canonicalWorktreePath, args.force ?? false, {
                  ...localWorktreeGitOptions,
                  ...(ignoredLinkedPaths.length > 0
                    ? { ignoredUntrackedPaths: ignoredLinkedPaths }
                    : {})
                })
              : ignoredLinkedPaths.length > 0
                ? assertWorktreeCleanForRemoval(canonicalWorktreePath, args.force ?? false, {
                    ignoredUntrackedPaths: ignoredLinkedPaths
                  })
                : assertWorktreeCleanForRemoval(canonicalWorktreePath, args.force ?? false))
          } catch (error) {
            if (!isOrphanCompatiblePreflightError(error)) {
              throw new Error(
                formatWorktreeRemovalError(error, canonicalWorktreePath, args.force ?? false)
              )
            }
            // Why: Git can still classify this as an orphan after preflight; keep strict PTY teardown before any recursive fallback deletion.
          }

          let removalResult: RemoveWorktreeResult | undefined
          const removalGate = await withWorktreeRemoveStageSpan('watcher_gate', 'local', async () =>
            runtime.acquireFileWatcherRemoval(canonicalWorktreePath)
          )
          let removalCompleted = false
          try {
            // Why: hold the watcher/terminal gate through Git and any recursive fallback so no late spawn recreates a native handle.
            // Linked-path deletion is destructive too, so PTYs must release every handle before Windows or WSL filesystem cleanup starts.
            await withWorktreeRemoveStageSpan('pty_sweep', 'local', async () => {
              await stopPtysForDestructiveWorktreeRemoval(runtime, args.worktreeId, {
                allowUnverifiedStop: args.allowUnverifiedPtyStop
              })
            })

            // Why: preflight only ignored these paths, not mutated them; keep watcher installs fenced through Git removal.
            if (linkedPaths.length > 0) {
              await removeWorktreeLinkedPaths(canonicalWorktreePath, linkedPaths)
            }

            try {
              const removeOptions = {
                ...(!deleteBranch ? { deleteBranch } : {}),
                // Why: reuse the authoritative worktree list already computed here instead of rescanning siblings on the hot delete path.
                knownRemovedWorktree: refreshedRegisteredWorktree,
                ...(hasLocalWorktreeGitOptions ? localWorktreeGitOptions : {})
              }
              removalResult = preserveBranchHeadFallback(
                await withWorktreeRemoveStageSpan('git_remove', 'local', async () =>
                  removeWorktree(
                    repo.path,
                    canonicalWorktreePath,
                    args.force ?? false,
                    removeOptions
                  )
                ),
                refreshedRegisteredWorktree.head
              )
            } catch (error) {
              // Why: Git for Windows can deregister a clean worktree before its recursive filesystem deletion fails transiently.
              const recoveredRemovalResult = await recoverLocalWindowsWorktreeRemoval({
                error,
                force: args.force ?? false,
                canonicalWorktreePath,
                repoPath: repo.path,
                localWorktreeGitOptions,
                registeredWorktree: refreshedRegisteredWorktree,
                deleteBranch,
                closeWatcher: (worktreePath) => runtime.closeFileWatchersForRemoval(worktreePath)
              })
              if (recoveredRemovalResult) {
                removalResult = recoveredRemovalResult
                removalCompleted = true
              } else if (isOrphanedWorktreeError(error)) {
                // If git no longer tracks this worktree, clean up the directory and metadata
                console.warn(
                  `[worktrees] Orphaned worktree detected at ${canonicalWorktreePath}, cleaning up`
                )
                const access = getLocalWorktreePathAccess(localWorktreeGitOptions)
                if (
                  await canSafelyRemoveOrphanedWorktreeDirectory(
                    toLocalWorktreeRuntimePath(canonicalWorktreePath, localWorktreeGitOptions),
                    toLocalWorktreeRuntimePath(repo.path, localWorktreeGitOptions),
                    access.statPath,
                    access.readPath
                  )
                ) {
                  await runtime.closeFileWatchersForRemoval(canonicalWorktreePath)
                  await removeLocalWorktreePath(
                    canonicalWorktreePath,
                    localWorktreeGitOptions
                  ).catch(() => {})
                } else {
                  console.warn(
                    `[worktrees] Refusing recursive cleanup for unproven worktree directory: ${canonicalWorktreePath}`
                  )
                }
                // Why: remove failed so git still tracks it (.git/worktrees/<name>); prune or the stale entry keeps its branch locked.
                await gitExecFileAsync(['worktree', 'prune'], {
                  cwd: repo.path,
                  ...localWorktreeGitOptions
                }).catch(() => {})
                await cleanupUnusedWorktreePushTargetRemote(
                  repo.path,
                  args.worktreeId,
                  removedPushTarget,
                  store,
                  localWorktreeGitOptions
                )
                runtime.clearOptimisticReconcileToken(args.worktreeId)
                removeWorktreeMetadataAndTransientState(
                  store,
                  args.worktreeId,
                  removalHostId,
                  args.snapshotPruneBatchId
                )
                preservedBranchCleanupByScope.delete(
                  preservedBranchCleanupScopeKey({
                    worktreeId: args.worktreeId,
                    hostId: removalHostId
                  })
                )
                invalidateAuthorizedRootsCache()
                notifyWorktreesChanged(mainWindow, repoId)
                removalCompleted = true
                return {}
              } else {
                throw new Error(
                  formatWorktreeRemovalError(error, canonicalWorktreePath, args.force ?? false)
                )
              }
            }
            removalCompleted = true
          } finally {
            await removalGate.finish(removalCompleted)
          }
          await cleanupUnusedWorktreePushTargetRemote(
            repo.path,
            args.worktreeId,
            removedPushTarget,
            store,
            localWorktreeGitOptions
          )
          rememberPreservedBranchCleanupTarget(
            args.worktreeId,
            removalHostId,
            removalResult,
            refreshedRegisteredWorktree.head,
            removedPushTarget
          )
          runtime.clearOptimisticReconcileToken(args.worktreeId)
          await withWorktreeRemoveStageSpan('metadata_purge', 'local', async () => {
            removeWorktreeMetadataAndTransientState(
              store,
              args.worktreeId,
              removalHostId,
              args.snapshotPruneBatchId
            )
          })
          await withWorktreeRemoveStageSpan('cache_invalidation', 'local', async () => {
            invalidateAuthorizedRootsCache()
          })

          notifyWorktreesChanged(mainWindow, repoId)
          return removalResult ?? {}
        })
      })()
      worktreeRemovalsInFlight.set(inFlightKey, { optionsKey, promise: removal })
      try {
        const result = await removal
        options?.onWorktreeLifecycle?.({
          kind: 'removed',
          worktreeId: args.worktreeId,
          path: parseWorktreeId(args.worktreeId).worktreePath
        })
        return result
      } finally {
        if (worktreeRemovalsInFlight.get(inFlightKey)?.promise === removal) {
          worktreeRemovalsInFlight.delete(inFlightKey)
        }
      }
    }
  )

  // Why: drop a workspace locally with no remote work, so one pinned to a dead SSH target (where worktrees:remove throws) can still be cleared.
  ipcMain.handle(
    'worktrees:forgetLocal',
    async (
      _event,
      args: Pick<RemoveWorktreeArgs, 'worktreeId' | 'hostId' | 'snapshotPruneBatchId'>
    ): Promise<RemoveWorktreeResult> => {
      const { repoId } = parseWorktreeId(args.worktreeId)
      const repoOwner = resolveWorktreeRemovalRepoOwner(store, repoId, args.hostId)
      if (!args.hostId && repoOwner.kind === 'ambiguous') {
        throw new Error(
          `Workspace identity is ambiguous across hosts: ${args.worktreeId}. Retry with an explicit host.`
        )
      }
      const repo = repoOwner.kind === 'resolved' ? repoOwner.repo : undefined
      // Repo-first (unlike owner resolution below) so this key matches worktrees:remove's; meta only covers ownerless forgets.
      const inFlightKey = getWorktreeRemovalInFlightKey(
        args.worktreeId,
        repo
          ? getRepoExecutionHostId(repo)
          : (args.hostId ?? store.getWorktreeMeta(args.worktreeId)?.hostId)
      )
      const optionsKey = 'forget-local'
      const inFlight = worktreeRemovalsInFlight.get(inFlightKey)
      if (inFlight) {
        if (inFlight.optionsKey === optionsKey) {
          return inFlight.promise
        }
        throw new Error(`Worktree deletion already in progress: ${args.worktreeId}`)
      }

      const forget = (async (): Promise<RemoveWorktreeResult> => {
        const isFolderRootOf = (candidate: Repo): boolean =>
          isFolderRepo(candidate) && args.worktreeId === getFolderWorkspaceRootId(candidate)
        const fallbackRepos = args.hostId
          ? store
              .getRepos()
              .filter((candidate) => getRepoExecutionHostId(candidate) === args.hostId)
          : store.getRepos()
        if (repo ? isFolderRootOf(repo) : fallbackRepos.some(isFolderRootOf)) {
          throw new Error(
            'Cannot delete the project root workspace. Remove the folder project instead.'
          )
        }

        const ownerHostId = resolveWorktreeRemovalOwnerHostId(
          store,
          args.worktreeId,
          repo,
          args.hostId
        )
        const ownerHost = parseExecutionHostId(ownerHostId)
        const sshPtyProvider =
          ownerHost?.kind === 'ssh' ? getSshPtyProvider(ownerHost.targetId) : undefined
        const externalHost = ownerHost?.kind === 'ssh' || ownerHost?.kind === 'runtime'
        // External host inventories must never sweep a same-id local workspace.
        await killAllProcessesForWorktree(args.worktreeId, {
          runtime,
          resolvedWorktreeId: args.worktreeId,
          ...(ownerHost?.kind === 'ssh' ? { resolvedConnectionId: ownerHost.targetId } : {}),
          ...(ownerHost?.kind === 'runtime'
            ? { resolvedRuntimeEnvironmentId: ownerHost.environmentId }
            : {}),
          localProvider: sshPtyProvider ?? getLocalPtyProvider(),
          onPtyStopped: clearProviderPtyState,
          ...(externalHost
            ? {
                includeProviderInventory: ownerHost?.kind === 'ssh' && Boolean(sshPtyProvider),
                includeLocalRegistry: false
              }
            : {})
        }).catch((err) => {
          console.warn(`[worktree-teardown] forget-local failed for ${args.worktreeId}:`, err)
        })

        runtime.clearOptimisticReconcileToken(args.worktreeId)
        // The resolved owner, not args.hostId: an orphan forget with no hostId still has to purge its SSH/runtime partition.
        removeWorktreeMetadataAndTransientState(
          store,
          args.worktreeId,
          ownerHost?.id,
          args.snapshotPruneBatchId
        )
        // Why: cached roots outlive the forgotten workspace, so an ownerless path stays filesystem-authorized until a rebuild.
        invalidateAuthorizedRootsCache()
        if (ownerHost?.id) {
          preservedBranchCleanupByScope.delete(
            preservedBranchCleanupScopeKey({ worktreeId: args.worktreeId, hostId: ownerHost.id })
          )
        } else {
          for (const [key, target] of preservedBranchCleanupByScope) {
            if (target.worktreeId === args.worktreeId) {
              preservedBranchCleanupByScope.delete(key)
            }
          }
        }
        notifyWorktreesChanged(mainWindow, repoId)
        return {}
      })()
      worktreeRemovalsInFlight.set(inFlightKey, { optionsKey, promise: forget })
      try {
        return await forget
      } finally {
        if (worktreeRemovalsInFlight.get(inFlightKey)?.promise === forget) {
          worktreeRemovalsInFlight.delete(inFlightKey)
        }
      }
    }
  )

  ipcMain.handle(
    'worktrees:forceDeletePreservedBranch',
    async (
      _event,
      args: {
        worktreeId: string
        branchName: string
        expectedHead: string
        hostId?: ExecutionHostId
      }
    ): Promise<ForceDeleteWorktreeBranchResult> => {
      const { repoId } = parseWorktreeId(args.worktreeId)
      const cleanupTarget = getPreservedBranchCleanupTarget(
        args.worktreeId,
        args.branchName,
        args.expectedHead,
        args.hostId
      )
      const repo = getRepoForWorktreeRemoval(store, repoId, cleanupTarget.hostId)
      if (!repo) {
        throw new Error(`Repo not found: ${repoId}`)
      }
      if (isFolderRepo(repo)) {
        throw new Error('Folder workspaces do not have local Git branches.')
      }

      if (repo.connectionId) {
        const provider = requireSshGitProvider(repo.connectionId)
        // Why: SSH needs the write-capable relay RPC; the read-only git.exec allowlist rejects these worktree/update-ref/config writes.
        await provider.forceDeletePreservedBranch(
          repo.path,
          cleanupTarget.branchName,
          cleanupTarget.head
        )
        await cleanupUnusedWorktreePushTargetRemoteSsh(
          provider,
          repo.path,
          args.worktreeId,
          cleanupTarget.pushTarget,
          store
        )
      } else {
        const localWorktreeGitOptions = getLocalProjectWorktreeGitOptions(store, repo)
        const hasLocalWorktreeGitOptions = Object.keys(localWorktreeGitOptions).length > 0
        await (hasLocalWorktreeGitOptions
          ? forceDeleteLocalBranch(
              repo.path,
              cleanupTarget.branchName,
              cleanupTarget.head,
              (argv, cwd) => gitExecFileAsync(argv, { cwd, ...localWorktreeGitOptions })
            )
          : forceDeleteLocalBranch(repo.path, cleanupTarget.branchName, cleanupTarget.head))
        await cleanupUnusedWorktreePushTargetRemote(
          repo.path,
          args.worktreeId,
          cleanupTarget.pushTarget,
          store,
          localWorktreeGitOptions
        )
      }

      preservedBranchCleanupByScope.delete(
        preservedBranchCleanupScopeKey({
          worktreeId: args.worktreeId,
          hostId: cleanupTarget.hostId
        })
      )
      return { deleted: true }
    }
  )

  ipcMain.handle(
    'worktrees:updateMeta',
    (_event, args: { worktreeId: string; updates: Partial<WorktreeMeta> }) => {
      const validatedUpdates = normalizeLinkedWorkItemFields(args.updates)
      const updates =
        validatedUpdates.displayName !== undefined
          ? {
              ...validatedUpdates,
              pendingFirstAgentMessageRename: false,
              firstAgentMessageRenameError: null
            }
          : validatedUpdates
      const meta = store.setWorktreeMeta(args.worktreeId, stripOrcaProvenanceMetaUpdates(updates))
      // Do NOT notify here: renderer already applied this optimistically; a notification would re-sort the sidebar (bug PR #209).
      if (args.updates.displayName !== undefined) {
        // Why: remote clients have no optimistic rename and stopped polling titles, so push a remote-only invalidation; gate on displayName so per-click isUnread updates stay event-free.
        runtime.notifyWorktreesChangedForRemoteClients(getRepoIdFromWorktreeId(args.worktreeId))
      }
      return meta
    }
  )

  ipcMain.handle('worktrees:listLineage', async () => {
    await runtime.hydrateInferredWorktreeLineage()
    return {
      lineage: store.getAllWorktreeLineage(),
      workspaceLineage: store.getAllWorkspaceLineage()
    }
  })

  ipcMain.handle(
    'worktrees:listLineageForHost',
    (_event, args: ListDesktopLineageForHostArgs): Promise<HostLineageSnapshot> =>
      listDesktopLineageForHost(store, runtime, args)
  )

  ipcMain.handle(
    'worktrees:updateLineage',
    async (_event, args: { worktreeId: string; parentWorktreeId?: string; noParent?: boolean }) => {
      await runtime.updateManagedWorktreeMeta(args.worktreeId, {
        lineage:
          args.noParent === true
            ? { noParent: true }
            : args.parentWorktreeId
              ? { parentWorktree: `id:${args.parentWorktreeId}` }
              : undefined
      })
      notifyWorktreesChanged(mainWindow, parseWorktreeId(args.worktreeId).repoId)
      return store.getWorktreeLineage(args.worktreeId) ?? null
    }
  )

  // Why: snapshot sidebar order for cold-start restore (ephemeral signals gone); one batch call avoids N updateMeta IPCs.
  ipcMain.handle('worktrees:persistSortOrder', (_event, args: { orderedIds: string[] }) => {
    if (!Array.isArray(args?.orderedIds) || args.orderedIds.length === 0) {
      return
    }
    const updates = planWorktreeSortOrderUpdates(
      args.orderedIds,
      (worktreeId) => store.getWorktreeMeta(worktreeId),
      Date.now()
    )
    for (const update of updates) {
      store.setWorktreeMeta(update.worktreeId, { sortOrder: update.sortOrder })
    }
  })

  // Why: full failure output lives only in main memory (not worktree metadata), so the dialog pulls it on demand.
  ipcMain.handle(
    'worktrees:getBranchRenameFailureOutput',
    (_event, args: { worktreeId: string }) => {
      if (typeof args?.worktreeId !== 'string' || args.worktreeId.length === 0) {
        return null
      }
      return readBranchRenameFailureOutputForDisplay(args.worktreeId)
    }
  )

  ipcMain.handle(
    'hooks:check',
    async (_event, args: { repoId: string; hostId?: ExecutionHostId }) => {
      const repo = getRepoForWorktreeRemoval(store, args.repoId, args.hostId)
      if (!repo) {
        const repoIdExists = store.getRepos().some((candidate) => candidate.id === args.repoId)
        // Why: callers treat inspection errors as "skip", so a requested/ambiguous host must report error (fail closed), not hook-free.
        return {
          status: args.hostId || repoIdExists ? 'error' : 'ok',
          hasHooks: false,
          hooks: null,
          mayNeedUpdate: false
        }
      }
      if (isFolderRepo(repo)) {
        return { status: 'ok', hasHooks: false, hooks: null, mayNeedUpdate: false }
      }

      if (repo.connectionId) {
        const fsProvider = getSshFilesystemProvider(repo.connectionId)
        if (!fsProvider) {
          return { status: 'error', hasHooks: false, hooks: null, mayNeedUpdate: false }
        }
        try {
          const result = await fsProvider.readFile(joinWorktreeRelativePath(repo.path, 'orca.yaml'))
          return {
            status: 'ok',
            hasHooks: !result.isBinary,
            hooks: result.isBinary ? null : parseOrcaYaml(result.content),
            mayNeedUpdate: false
          }
        } catch (error) {
          return {
            status: isENOENT(error) ? 'ok' : 'error',
            hasHooks: false,
            hooks: null,
            mayNeedUpdate: false
          }
        }
      }

      const has = hasHooksFile(repo.path)
      const hooks = has ? loadHooks(repo.path) : null
      // Why: unrecognised top-level keys mean the file is well-formed but from a newer Orca; suggest updating rather than "could not be parsed".
      const mayNeedUpdate = has && !hooks && hasUnrecognizedOrcaYamlKeys(repo.path)
      return {
        status: 'ok',
        hasHooks: has,
        hooks,
        mayNeedUpdate
      }
    }
  )

  ipcMain.handle(
    'hooks:createIssueCommandRunner',
    (_event, args: { repoId: string; worktreePath: string; command: string }) => {
      const repo = store.getRepo(args.repoId)
      if (!repo) {
        throw new Error(`Repo not found: ${args.repoId}`)
      }

      return createIssueCommandRunnerScript(
        repo,
        args.worktreePath,
        args.command,
        getLocalProjectWorktreeGitOptions(store, repo),
        resolveSetupRunnerShell(store.getSettings())
      )
    }
  )

  ipcMain.handle(
    'hooks:inspectSetupScriptImports',
    async (_event, args: { repoId: string; hostId?: ExecutionHostId }) => {
      const repo = getRepoForWorktreeRemoval(store, args.repoId, args.hostId)
      if (!repo || isFolderRepo(repo)) {
        return []
      }

      return inspectSetupScriptImportCandidates(
        async (relativePath) => {
          const filePath = joinWorktreeRelativePath(repo.path, relativePath)
          if (repo.connectionId) {
            const fsProvider = getSshFilesystemProvider(repo.connectionId)
            if (!fsProvider) {
              return null
            }
            try {
              const result = await fsProvider.readFile(filePath)
              return result.isBinary ? null : result.content
            } catch {
              return null
            }
          }

          try {
            return await readFile(filePath, 'utf-8')
          } catch (error) {
            if (!isENOENT(error)) {
              console.warn('[hooks] Failed to inspect setup script import candidate:', error)
            }
            return null
          }
        },
        {
          fileExists: async (relativePath) => {
            const filePath = joinWorktreeRelativePath(repo.path, relativePath)
            if (repo.connectionId) {
              const fsProvider = getSshFilesystemProvider(repo.connectionId)
              if (!fsProvider) {
                return false
              }
              try {
                const fileStat = await fsProvider.stat(filePath)
                return fileStat.type !== 'directory'
              } catch {
                return false
              }
            }

            try {
              const fileStat = await stat(filePath)
              return !fileStat.isDirectory()
            } catch (error) {
              if (!isENOENT(error)) {
                console.warn('[hooks] Failed to stat setup script import candidate:', error)
              }
              return false
            }
          }
        }
      )
    }
  )

  ipcMain.handle(
    'hooks:readIssueCommand',
    async (_event, args: { repoId: string; hostId?: ExecutionHostId }) => {
      const repo = getRepoForWorktreeRemoval(store, args.repoId, args.hostId)
      if (!repo || isFolderRepo(repo)) {
        return {
          status: 'ok',
          localContent: null,
          sharedContent: null,
          effectiveContent: null,
          localFilePath: '',
          source: 'none' as const
        }
      }
      if (repo.connectionId) {
        const orcaDirName = resolveWorkspaceOrcaDirName(store.getSettings())
        const issueCommandPath = joinWorktreeRelativePath(repo.path, `${orcaDirName}/issue-command`)
        const fsProvider = getSshFilesystemProvider(repo.connectionId)
        if (!fsProvider) {
          return {
            status: 'error',
            localContent: null,
            sharedContent: null,
            effectiveContent: null,
            localFilePath: issueCommandPath,
            source: 'none' as const
          }
        }

        let status: 'ok' | 'error' = 'ok'
        let localContent: string | null = null
        let sharedContent: string | null = null
        try {
          const result = await fsProvider.readFile(issueCommandPath)
          localContent = result.isBinary ? null : result.content.trim() || null
        } catch (error) {
          if (!isENOENT(error)) {
            status = 'error'
          }
        }
        try {
          const result = await fsProvider.readFile(joinWorktreeRelativePath(repo.path, 'orca.yaml'))
          sharedContent = result.isBinary
            ? null
            : parseOrcaYaml(result.content)?.issueCommand?.trim() || null
        } catch (error) {
          if (!isENOENT(error)) {
            status = 'error'
          }
        }
        const effectiveContent = localContent ?? sharedContent
        return {
          status: localContent ? 'ok' : status,
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
      return readIssueCommand(repo.path, resolveWorkspaceOrcaDirName(store.getSettings()))
    }
  )

  ipcMain.handle(
    'hooks:writeIssueCommand',
    async (_event, args: { repoId: string; content: string; hostId?: ExecutionHostId }) => {
      const repo = getRepoForWorktreeRemoval(store, args.repoId, args.hostId)
      if (!repo || isFolderRepo(repo)) {
        return
      }
      if (repo.connectionId) {
        const orcaDirName = resolveWorkspaceOrcaDirName(store.getSettings())
        const issueCommandPath = joinWorktreeRelativePath(repo.path, `${orcaDirName}/issue-command`)
        const fsProvider = getSshFilesystemProvider(repo.connectionId)
        if (!fsProvider) {
          throw new Error(
            'Remote filesystem unavailable. Reconnect the SSH target before retrying.'
          )
        }
        const trimmed = args.content.trim()
        if (!trimmed) {
          await fsProvider.deletePath(issueCommandPath, false).catch((error: unknown) => {
            if (!isENOENT(error)) {
              throw error
            }
          })
          return
        }
        await fsProvider.createDir(joinWorktreeRelativePath(repo.path, orcaDirName))
        const gitignorePath = joinWorktreeRelativePath(repo.path, '.gitignore')
        try {
          const result = await fsProvider.readFile(gitignorePath)
          if (!result.isBinary) {
            const next = appendOrcaDirIgnore(result.content, orcaDirName)
            if (next !== result.content) {
              await fsProvider.writeFile(gitignorePath, next)
            }
          }
        } catch (error) {
          if (!isENOENT(error)) {
            throw error
          }
          await fsProvider.writeFile(gitignorePath, appendOrcaDirIgnore('', orcaDirName))
        }
        await fsProvider.writeFile(issueCommandPath, `${trimmed}\n`)
        return
      }
      writeIssueCommand(repo.path, resolveWorkspaceOrcaDirName(store.getSettings()), args.content)
    }
  )
}
