import type { BranchNameWorkContext } from '../../shared/branch-name-from-work'
import type { CommitMessageDraftContext } from '../../shared/commit-message-generation'
import { LOCAL_COMMIT_MESSAGE_HOST_KEY } from '../../shared/commit-message-host-key'
import type { CommitMessagePlan } from '../../shared/commit-message-plan'
import type { CommandTemplateBackslash } from '../../shared/commit-message-prompt'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type {
  GeneratedPullRequestFields,
  PullRequestDraftContext
} from '../../shared/pull-request-generation'
import type { Repo } from '../../shared/repo-types'
import {
  resolveSourceControlAiForOperation,
  type ResolvedSourceControlAiGenerationParams
} from '../../shared/source-control-ai'
import type { SourceControlAiOperation } from '../../shared/source-control-ai-types'
import type { TuiAgent } from '../../shared/tui-agent'
import {
  discoverModelsLocal,
  discoverModelsRemote,
  type CommitMessageModelDiscoveryLocalOptions
} from './commit-message-model-discovery'
import { spawnSourceControlAgent } from './source-control-agent-launch'
import { cancelLocalGeneration } from './source-control-generation-lanes'
import {
  commandBackslashMode as resolveCommandBackslashMode,
  generateBranchName,
  generateCommitMessage,
  generatePullRequestFields,
  trimGeneratedCommitMessage as trimCommitMessage
} from './source-control-text-generation-requests'
import type {
  CommitMessageGenerationTarget,
  DiscoverCommitMessageModelsResult,
  GenerateBranchNameResult,
  GenerateCommitMessageResult,
  GeneratePullRequestFieldsResult as GenericGeneratePullRequestFieldsResult,
  RemoteCommitMessageExecResult,
  TextGenerationOperation
} from './source-control-text-generation-types'

export type GenerateCommitMessageParams = ResolvedSourceControlAiGenerationParams
export type {
  CommitMessageGenerationTarget,
  CommitMessageModelDiscoveryLocalOptions,
  DiscoverCommitMessageModelsResult,
  GenerateBranchNameResult,
  GenerateCommitMessageResult,
  RemoteCommitMessageExecResult,
  TextGenerationOperation
}

export type TextGenerationOperation =
  | 'commit-message'
  | 'pull-request-fields'
  | 'branch-name'
  | 'translation'

export type CommitMessageGenerationTarget =
  | { kind: 'local'; cwd: string; env?: NodeJS.ProcessEnv; wslDistro?: string }
  | {
      kind: 'remote'
      cwd: string
      execute: (
        plan: CommitMessagePlan,
        cwd: string,
        timeoutMs: number,
        operation: TextGenerationOperation
      ) => Promise<RemoteCommitMessageExecResult>
      missingBinaryLocation: string
    }

type ResolveCommitMessageSettingsResult =
  | { ok: true; params: GenerateCommitMessageParams }
  | { ok: false; error: string }

export type InternalTextGenerationResult =
  | { success: true; rawOutput: string; agentLabel?: string }
  | {
      success: false
      error: string
      canceled?: boolean
      /** Bounded full CLI output for on-demand local display. Stripped from
       *  every renderer-bound result so it never crosses IPC wholesale. */
      failureOutput?: AgentGenerationFailureOutput
    }

type LocalProcessExecution<T> = {
  result: Promise<T>
  processClosed: Promise<void>
}

export type CommitMessageModelDiscoveryLocalOptions = {
  cwd?: string
  wslDistro?: string
}

export function trimGeneratedCommitMessage(message: string): string {
  return trimCommitMessage(message)
}

export function resolveCommitMessageSettings(
  settings: GlobalSettings,
  discoveryHostKey = LOCAL_COMMIT_MESSAGE_HOST_KEY,
  operation: SourceControlAiOperation = 'commitMessage',
  repo?: Pick<Repo, 'sourceControlAi'> | null
): ResolveCommitMessageSettingsResult {
  const resolved = resolveSourceControlAiForOperation({
    settings,
    repo,
    operation,
    discoveryHostKey
  })
  return resolved.ok ? { ok: true, params: resolved.value.params } : resolved
}

export function resolveTextGenerationParams(
  settings: GlobalSettings,
  discoveryHostKey = LOCAL_COMMIT_MESSAGE_HOST_KEY,
  operation: SourceControlAiOperation = 'commitMessage',
  repo?: Pick<Repo, 'sourceControlAi'> | null
): ResolveCommitMessageSettingsResult {
  return resolveCommitMessageSettings(settings, discoveryHostKey, operation, repo)
}

export function commandBackslashMode(
  target: CommitMessageGenerationTarget,
  platform: NodeJS.Platform = process.platform
): CommandTemplateBackslash {
  return resolveCommandBackslashMode(target, platform)
}

export async function discoverCommitMessageModelsLocal(
  agentId: TuiAgent,
  env: NodeJS.ProcessEnv | undefined,
  agentCommandOverride?: string,
  options: CommitMessageModelDiscoveryLocalOptions = {}
): Promise<DiscoverCommitMessageModelsResult> {
  return discoverModelsLocal({
    agentId,
    env,
    agentCommandOverride,
    options,
    backslash: commandBackslashMode({
      kind: 'local',
      cwd: options.cwd ?? '',
      wslDistro: options.wslDistro
    }),
    spawnAgent: spawnSourceControlAgent
  })
}

export async function discoverCommitMessageModelsRemote(
  agentId: TuiAgent,
  cwd: string,
  execute: (
    plan: CommitMessagePlan,
    cwd: string,
    timeoutMs: number
  ) => Promise<RemoteCommitMessageExecResult>,
  agentCommandOverride?: string
): Promise<DiscoverCommitMessageModelsResult> {
  return discoverModelsRemote({ agentId, cwd, execute, agentCommandOverride })
}

export function cancelGenerateCommitMessageLocal(cwd: string): void {
  cancelLocalGeneration('commit-message', cwd)
}

export function cancelGeneratePullRequestFieldsLocal(cwd: string): void {
  cancelLocalGeneration('pull-request-fields', cwd)
}

function runLocalPlan(
  plan: CommitMessagePlan,
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
  emptyResultName = 'message',
  operation: TextGenerationOperation = 'commit-message',
  wslDistro?: string,
  holdHomeLockUntilExit = false
): LocalProcessExecution<InternalTextGenerationResult> {
  const { binary, args, stdinPayload, label } = plan
  let markProcessClosed!: () => void
  const processClosed = new Promise<void>((resolve) => {
    markProcessClosed = resolve
  })
  const result = new Promise<InternalTextGenerationResult>((resolve) => {
    let child: ChildProcess
    try {
      const spawnEnv = env ?? process.env
      if (process.platform === 'win32' && wslDistro) {
        child = wslAwareSpawn(binary, args, {
          cwd,
          env: buildWslLauncherEnv(env),
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          wslDistro,
          useWslLoginShell: true
        })
      } else {
        const resolvedBinary =
          process.platform === 'win32'
            ? resolveCliCommand(binary, { pathEnv: spawnEnv.PATH ?? spawnEnv.Path ?? null })
            : binary
        const { spawnCmd, spawnArgs } = getSpawnArgsForWindows(resolvedBinary, args)
        child = spawn(spawnCmd, spawnArgs, {
          cwd,
          env: spawnEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      }
    } catch (error) {
      markProcessClosed()
      if (error instanceof UnsafeWindowsBatchArgumentsError) {
        resolve({
          success: false,
          error: userFacingUnsafeWindowsBatchArgs(label)
        })
        return
      }
      console.error('[commit-message] Failed to spawn local generator:', error)
      resolve({
        success: false,
        error: `${label} could not be started. Check the agent command in Settings and try again.`
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let outputLimitExceeded = false
    let settled = false
    let canceledByUser = false
    const laneKey = localLaneKey(operation, cwd)
    let cancelToken: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let terminationComplete: Promise<void> | null = null
    let detachChildListeners = (): void => {}
    const startTermination = (): void => {
      terminationComplete ??= killProcessTree(child)
    }
    const markClosedAfterTermination = (): void => {
      void (terminationComplete ?? Promise.resolve()).then(markProcessClosed)
    }
    const finalize = (result: InternalTextGenerationResult): void => {
      if (settled) {
        return
      }
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      detachChildListeners()
      if (cancelToken && cancelTokensByLane.get(laneKey) === cancelToken) {
        cancelTokensByLane.delete(laneKey)
      }
      if (!holdHomeLockUntilExit) {
        markProcessClosed()
      }
      resolve(result)
    }

    cancelToken = () => {
      canceledByUser = true
      startTermination()
      // Why: cancellation is a user-visible UI command; do not wait for a
      // wedged agent CLI to emit `close` before the request leaves loading.
      finalize({ success: false, error: 'Generation canceled.', canceled: true })
    }
    cancelTokensByLane.set(laneKey, cancelToken)

    timer = setTimeout(() => {
      startTermination()
      finalize({
        success: false,
        error: `Generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s.`
      })
    }, GENERATION_TIMEOUT_MS)

    const onStdoutData = (chunk: Buffer): void => {
      stdoutBytes += chunk.byteLength
      if (stdoutBytes > MAX_AGENT_OUTPUT_BYTES) {
        outputLimitExceeded = true
        startTermination()
        return
      }
      stdout += chunk.toString('utf-8')
    }
    const onStderrData = (chunk: Buffer): void => {
      stderrBytes += chunk.byteLength
      if (stderrBytes > MAX_AGENT_OUTPUT_BYTES) {
        outputLimitExceeded = true
        startTermination()
        return
      }
      stderr += chunk.toString('utf-8')
    }
    const onError = (error: Error): void => {
      if (!child.pid) {
        markProcessClosed()
      }
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        finalize({
          success: false,
          error: `${binary} not found on PATH. Install ${label} to use AI commit messages.`
        })
        return
      }
      console.error('[commit-message] Local generator failed after spawn:', error)
      finalize({
        success: false,
        error: `${label} failed to start. Check the agent command in Settings and try again.`
      })
    }
    const onClose = (code: number | null): void => {
      markClosedAfterTermination()
      if (canceledByUser) {
        finalize({ success: false, error: 'Generation canceled.', canceled: true })
        return
      }
      if (outputLimitExceeded) {
        finalize({
          success: false,
          error: `${label} CLI command produced too much output. Check the agent CLI configuration and try again.`
        })
        return
      }
      finalizeFromAgentOutput({
        code,
        stdout,
        stderr,
        label,
        emptyResultName,
        finalize,
        includeStdoutDetail: operation !== 'branch-name'
      })
    }
    child.stdout?.on('data', onStdoutData)
    child.stderr?.on('data', onStderrData)
    if (holdHomeLockUntilExit) {
      // Why: 'close' also waits on descendants that inherited this child's
      // stdio, so a surviving MCP helper would hold the home forever; at 'exit'
      // the codex process is gone and can no longer rotate auth.json.
      child.once('exit', markClosedAfterTermination)
      child.once('close', markClosedAfterTermination)
    }
    child.on('error', onError)
    child.on('close', onClose)
    detachChildListeners = () => {
      child.stdout?.off?.('data', onStdoutData)
      child.stderr?.off?.('data', onStderrData)
      child.off?.('error', onError)
      child.off?.('close', onClose)
    }

    try {
      child.stdin?.end(stdinPayload ?? undefined)
    } catch (error) {
      startTermination()
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  })
  return { result, processClosed }
}

/**
 * How the user's command override should read `\`.
 *
 * `'literal'` only when the command provably runs on native Windows: a LOCAL
 * target, on win32, with no WSL distro. A WSL target runs a Linux binary inside
 * the distro, and a remote target runs on a host whose platform this process
 * cannot see — POSIX escaping stays the default for both.
 */
export function commandBackslashMode(
  target: CommitMessageGenerationTarget,
  platform: NodeJS.Platform = process.platform
): CommandTemplateBackslash {
  return platform === 'win32' && target.kind === 'local' && !target.wslDistro ? 'literal' : 'escape'
}

export type LocalGenerationTarget = Extract<CommitMessageGenerationTarget, { kind: 'local' }>

export function runLocalPlanForAgent(
  agentId: string,
  plan: CommitMessagePlan,
  target: LocalGenerationTarget,
  emptyResultName: string,
  operation: TextGenerationOperation
): Promise<InternalTextGenerationResult> {
  const start = (
    holdHomeLockUntilExit = false
  ): LocalProcessExecution<InternalTextGenerationResult> =>
    runLocalPlan(
      plan,
      target.cwd,
      target.env,
      emptyResultName,
      operation,
      target.wslDistro,
      holdHomeLockUntilExit
    )
  if (agentId !== 'codex') {
    // Why: no extra promise hops here — cancellation timing for non-codex
    // agents must stay byte-identical to a direct runLocalPlan call.
    return start().result
  }
  return runCodexLocalPlanUnderHomeLock(() => start(true), target, operation)
}

// Why: codex rewrites rotating OAuth tokens in its home's auth.json; the
// per-home lock keeps this run from racing Orca's own quota probes there.
function runCodexLocalPlanUnderHomeLock(
  start: () => LocalProcessExecution<InternalTextGenerationResult>,
  target: LocalGenerationTarget,
  operation: TextGenerationOperation
): Promise<InternalTextGenerationResult> {
  const laneKey = localLaneKey(operation, target.cwd)
  let canceledWhileQueued = false
  let publishResult!: (result: InternalTextGenerationResult) => void
  let rejectResult!: (error: unknown) => void
  let resultPublished = false
  const result = new Promise<InternalTextGenerationResult>((resolve, reject) => {
    publishResult = (value) => {
      if (!resultPublished) {
        resultPublished = true
        resolve(value)
      }
    }
    rejectResult = reject
  })
  const queuedCancelToken = (): void => {
    canceledWhileQueued = true
    publishResult({ success: false, error: 'Generation canceled.', canceled: true })
  }
  // Why: Stop must work while this run waits behind a probe holding the lock.
  cancelTokensByLane.set(laneKey, queuedCancelToken)
  void withCodexHomeProcessLock(
    resolveCodexHomeProcessLockKeyForSpawnEnv(target.env, target.wslDistro),
    async () => {
      if (canceledWhileQueued) {
        publishResult({ success: false, error: 'Generation canceled.', canceled: true })
        return
      }
      const execution = start()
      try {
        publishResult(await execution.result)
      } catch (error) {
        if (!resultPublished) {
          rejectResult(error)
        }
      } finally {
        await execution.processClosed
      }
    }
  )
    .catch((error: unknown) => {
      if (!resultPublished) {
        rejectResult(error)
      }
    })
    .finally(() => {
      if (cancelTokensByLane.get(laneKey) === queuedCancelToken) {
        cancelTokensByLane.delete(laneKey)
      }
    })
  return result
}

function runCodexProcessWithHomeLock<T>(
  lockKey: string,
  start: () => LocalProcessExecution<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    void withCodexHomeProcessLock(lockKey, async () => {
      const execution = start()
      try {
        resolve(await execution.result)
      } catch (error) {
        reject(error)
      } finally {
        await execution.processClosed
      }
    }).catch(reject)
  })
}

function finalizeFromAgentOutput(args: {
  code: number | null
  stdout: string
  stderr: string
  label: string
  emptyResultName: string
  finalize: (result: InternalTextGenerationResult) => void
  includeLocalMacDnsHint?: boolean
  includeStdoutDetail?: boolean
}): void {
  const {
    code,
    stdout,
    stderr,
    label,
    emptyResultName,
    finalize,
    includeLocalMacDnsHint,
    includeStdoutDetail
  } = args
  if (code !== 0) {
    console.error('[commit-message] Generator failed:', {
      label,
      exitCode: code,
      stdout,
      stderr
    })
    finalize({
      success: false,
      error: formatAgentCliFailureMessage(label, stdout, stderr, code, {
        includeLocalMacDnsHint,
        includeStdoutDetail
      }),
      failureOutput: captureAgentGenerationFailureOutput(label, code, stdout, stderr) ?? undefined
    })
    return
  }
  const cleaned = cleanGeneratedCommitMessage(stdout)
  if (!cleaned) {
    // stdout is the (empty) result here, not diagnostics, so only stderr is
    // excerpted. The run exited 0, so this stays "returned an empty result"
    // rather than misreporting a command failure.
    const detail = sanitizeAgentFailureDetail(excerptAgentFailureOutput('', stderr))
    if (detail) {
      console.error('[commit-message] Generator returned no stdout but wrote to stderr:', {
        label,
        exitCode: code,
        stdout,
        stderr
      })
    }
    finalize({
      success: false,
      error: detail
        ? `${label} returned an empty ${emptyResultName}. CLI output: ${detail}`
        : `${label} returned an empty ${emptyResultName}.`,
      failureOutput: captureAgentGenerationFailureOutput(label, code, stdout, stderr) ?? undefined
    })
    return
  }
  finalize({
    success: true,
    rawOutput: cleaned,
    agentLabel: label
  })
}

async function runRemotePlan(
  plan: CommitMessagePlan,
  target: Extract<CommitMessageGenerationTarget, { kind: 'remote' }>,
  emptyResultName = 'message',
  operation: TextGenerationOperation = 'commit-message'
): Promise<InternalTextGenerationResult> {
  const { binary, label } = plan
  let result: RemoteCommitMessageExecResult
  try {
    result = await target.execute(plan, target.cwd, GENERATION_TIMEOUT_MS, operation)
  } catch (error) {
    console.error('[commit-message] Remote generator request failed:', error)
    if (isSshMuxRequestTimeoutError(error)) {
      return {
        success: false,
        error: `${label} took longer than ${GENERATION_TIMEOUT_MS / 1000}s to respond and may still be running on the remote host.`
      }
    }
    return {
      success: false,
      error: `${label} could not be reached on the ${target.missingBinaryLocation}. Try again after the SSH connection recovers.`
    }
  }
  if (result.spawnError) {
    if (result.spawnError === WINDOWS_BATCH_UNSAFE_ARGUMENTS_ERROR) {
      return {
        success: false,
        error: userFacingUnsafeWindowsBatchArgs(label)
      }
    }
    if (/ENOENT/i.test(result.spawnError)) {
      return {
        success: false,
        error: `${binary} not found on the ${target.missingBinaryLocation}. Install ${label} there.`
      }
    }
    console.error('[commit-message] Remote generator spawn failed:', result.spawnError)
    return {
      success: false,
      error: `${label} could not be started on the ${target.missingBinaryLocation}. Check the agent command there and try again.`
    }
  }
  if (result.canceled) {
    return { success: false, error: 'Generation canceled.', canceled: true }
  }
  if (result.timedOut) {
    return {
      success: false,
      error: `Generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s.`
    }
  }

  return new Promise((resolve) => {
    finalizeFromAgentOutput({
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      label,
      emptyResultName,
      finalize: resolve,
      // Why: remote agent output reflects the SSH target, not this Mac's DNS.
      includeLocalMacDnsHint: false,
      // Branch failures persist into synced metadata; stdout may echo the prompt.
      includeStdoutDetail: operation !== 'branch-name'
    })
  })
}

function formatCommitMessageGenerationResult(
  result: InternalTextGenerationResult
): GenerateCommitMessageResult {
  if (!result.success) {
    // Keep the bulky local-only capture off the renderer-bound payload.
    return { success: false, error: result.error, canceled: result.canceled }
  }
  let commitMessage: GeneratedCommitMessage
  try {
    commitMessage = splitGeneratedCommitMessage(result.rawOutput)
  } catch {
    return { success: false, error: 'Generated commit message could not be parsed.' }
  }
  return {
    success: true,
    message: trimGeneratedCommitMessage(commitMessage.message),
    agentLabel: result.agentLabel
  }
}

export async function generateCommitMessageFromContext(
  context: CommitMessageDraftContext,
  params: GenerateCommitMessageParams,
  target: CommitMessageGenerationTarget
): Promise<GenerateCommitMessageResult> {
  return generateCommitMessage({ context, params, target, spawnAgent: spawnSourceControlAgent })
}

export function cancelGeneratePullRequestFieldsLocal(cwd: string): void {
  cancelTokensByLane.get(localLaneKey('pull-request-fields', cwd))?.()
}

export function cancelGenerateTranslationLocal(cwd: string): void {
  cancelTokensByLane.get(localLaneKey('translation', cwd))?.()
}

function formatPullRequestFieldsGenerationResult(
  result: InternalTextGenerationResult,
  context: PullRequestDraftContext
): GeneratePullRequestFieldsResult {
  if (!result.success) {
    // Keep the bulky local-only capture off the renderer-bound payload.
    return {
      success: false,
      error: result.error,
      canceled: result.canceled,
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  }
  try {
    return {
      success: true,
      fields: parseGeneratedPullRequestFields(result.rawOutput, context),
      agentLabel: result.agentLabel,
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  } catch {
    return {
      success: false,
      error: 'Generated pull request details could not be parsed.',
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  }
}

export async function generatePullRequestFieldsFromContext(
  context: PullRequestDraftContext,
  params: GenerateCommitMessageParams,
  target: CommitMessageGenerationTarget
): Promise<GeneratePullRequestFieldsResult> {
  return generatePullRequestFields({ context, params, target, spawnAgent: spawnSourceControlAgent })
}

export function generateBranchNameFromContext(
  context: BranchNameWorkContext,
  params: GenerateCommitMessageParams,
  target: CommitMessageGenerationTarget
): Promise<GenerateBranchNameResult> {
  return generateBranchName({ context, params, target, spawnAgent: spawnSourceControlAgent })
}
