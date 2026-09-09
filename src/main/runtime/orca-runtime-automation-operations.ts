// @ts-nocheck -- mechanically split from OrcaRuntimeService; behavior is covered by AST equivalence and characterization tests.
import { OrcaRuntimeWithPtyForegroundProcessReads } from './orca-runtime-pty-foreground-process-reads'
import type {
  AutomationOwnerFenceOperation,
  AutomationOwnerPrecondition,
  AutomationDestination
} from '../../shared/automation-owner-precondition'
import type { Automation, AutomationRun } from '../../shared/automations-types'
import type {
  RuntimeAutomationCreateInput,
  RuntimeAutomationUpdateInput
} from './runtime-automation-controller'
import {
  automationChangePublications,
  type AutomationChangeSelector,
  type AutomationListResult
} from '../../shared/automation-list-scope'
import { OrchestrationDb } from './orchestration/db'
import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { TodoDatabase } from '../todos/todo-database'
import { TodoRepository } from '../todos/todo-repository'
import { TodoOrchestratorService } from '../todos/todo-orchestrator-service'
import { resolveWorkspaceProjectCwd } from '../../shared/todo/workspace-project-cwd'
import { DEFAULT_TODO_ORCHESTRATOR_CONFIG } from '../../shared/todo/todo-orchestrator-config'
import { DEFAULT_TODO_DESIGN_STAGE_SKILL } from '../../shared/constants'
import { AcpSessionDatabase } from '../acp/acp-session-database'
import { AcpSessionRepository } from '../acp/acp-session-repository'
import { buildAcpKernel } from '../acp/acp-kernel'
import { broadcastAcpEvent } from '../acp/acp-renderer-events'
import { resolveWorkspaceOrcaDirName } from '../../shared/orca-dir-names'
import type { LegacyWorkerTerminalRecoveryPlan } from './orchestration/orchestration-legacy-worker-terminal-recovery'
import type { LegacyWorkerTerminalRecoveryResult } from './runtime-legacy-worker-terminal-recovery-types'
import { makePaneKey } from '../../shared/stable-pane-id'
import { runtimeWorktreeIdsEqual } from './runtime-worktree-path-identity'

export class OrcaRuntimeWithAutomationOperations extends OrcaRuntimeWithPtyForegroundProcessReads {
  protected fenceAutomationOwner(
    id: string,
    expectedOwner: AutomationOwnerPrecondition | undefined,
    operation: AutomationOwnerFenceOperation
  ): void {
    if (!this.store?.assertAutomationOwnerFence) {
      if (expectedOwner) {
        throw new Error('runtime_unavailable')
      }
      return
    }
    this.store.assertAutomationOwnerFence({ id, expectedOwner, operation })
  }

  listAutomationRuns(
    automationId?: string,
    expectedOwner?: AutomationOwnerPrecondition
  ): AutomationRun[] {
    if (expectedOwner && !automationId) {
      throw new Error('An expected owner requires an automation id.')
    }
    return this.automation.withExternalProbePriority(() => {
      if (automationId) {
        this.fenceAutomationOwner(automationId, expectedOwner, 'read')
      }
      return this.automation.listRuns(automationId)
    })
  }

  listAutomationRunsPage(
    automationId?: string,
    expectedOwner?: AutomationOwnerPrecondition,
    limit?: number,
    cursor?: string
  ) {
    if (expectedOwner && !automationId) {
      throw new Error('An expected owner requires an automation id.')
    }
    return this.automation.withExternalProbePriority(() => {
      if (automationId) {
        this.fenceAutomationOwner(automationId, expectedOwner, 'read')
      }
      return this.automation.listRunsPage(automationId, limit, cursor)
    })
  }

  showAutomation(id: string, expectedOwner?: AutomationOwnerPrecondition): Automation {
    const automation = this.automation.show(id)
    this.fenceAutomationOwner(id, expectedOwner, 'read')
    return automation
  }

  protected automationChangeSelector(id: string): AutomationChangeSelector | null {
    return this.store?.automationChangeSelector?.(id) ?? null
  }

  /** A store that cannot name the affected host degrades to one unscoped authority event. */
  protected publishAutomationDefinitionChange(
    before: AutomationChangeSelector | null,
    after: AutomationChangeSelector | null
  ): void {
    for (const selector of automationChangePublications(before, after)) {
      this.notifyAutomationsChanged({ reason: 'definition', ...(selector ? { selector } : {}) })
    }
  }

  createAutomation(
    input: RuntimeAutomationCreateInput,
    destination?: AutomationDestination
  ): Promise<Automation> {
    return this.automation.withExternalProbePriority(() =>
      this.automation.create(input, destination).then((automation) => {
        const selector = this.automationChangeSelector(automation.id)
        this.publishAutomationDefinitionChange(selector, selector)
        return automation
      })
    )
  }

  updateAutomation(
    id: string,
    updates: RuntimeAutomationUpdateInput,
    options?: unknown
  ): Promise<Automation> {
    return this.automation.withExternalProbePriority(() => {
      const source = this.automationChangeSelector(id)
      return this.automation.update(id, updates, options as never).then((automation) => {
        this.publishAutomationDefinitionChange(source, this.automationChangeSelector(automation.id))
        return automation
      })
    })
  }

  deleteAutomation(
    id: string,
    expectedOwner?: AutomationOwnerPrecondition
  ): { removed: boolean; id: string } {
    return this.automation.withExternalProbePriority(() => {
      const selector = this.automationChangeSelector(id)
      const result = this.automation.delete(id, expectedOwner as never)
      this.publishAutomationDefinitionChange(selector, selector)
      return result
    })
  }

  runAutomationNow(
    id: string,
    expectedOwner?: AutomationOwnerPrecondition
  ): Promise<AutomationRun> {
    return this.automation.withExternalProbePriority(() =>
      this.automation.runNow(id, expectedOwner as never)
    )
  }

  listAutomationsForScope(params = {}): AutomationListResult {
    return this.automation.withExternalProbePriority(() => this.automation.listForScope(params))
  }

  automationOwnerPrecondition(id: string): AutomationOwnerPrecondition | null {
    return this.automation.ownerPrecondition(id)
  }

  // Why: lazy initialization — the DB path depends on Electron's userData
  // which may not be finalized until after app.ready. Also allows unit tests
  // to inject an in-memory DB without touching the filesystem.
  getOrchestrationDb(): OrchestrationDb {
    if (!this._orchestrationDb) {
      const dbPath = join(getAppEnvironment().getPath('userData'), 'orchestration.db')
      this._orchestrationDb = new OrchestrationDb(dbPath)
      this.ensureOrchestrationFederationRelay()
      this.scheduleRestoredMessageRepoints()
    }
    return this._orchestrationDb
  }

  setOrchestrationDb(db: OrchestrationDb): void {
    this.orchestrationFederation.resetForDatabaseChange()
    this.mailPointerRepointScheduler.clear()
    this._orchestrationDb = db
    this.ensureOrchestrationFederationRelay()
    this.scheduleRestoredMessageRepoints()
  }

  // Why: lazy initialization mirrors the orchestration DB — the todo DB path
  // depends on Electron's userData which isn't finalized until after app.ready.
  getTodoRepository(): TodoRepository {
    if (!this._todoRepository) {
      const dbPath = join(getAppEnvironment().getPath('userData'), 'todo.db')
      this._todoRepository = new TodoRepository(new TodoDatabase(dbPath))
    }
    return this._todoRepository
  }

  // Why: ACP session DB is its own file so the execution domain stays decoupled
  // from the todo domain; lazy for the same userData-after-ready reason as todos.
  getAcpSessionRepository(): AcpSessionRepository {
    if (!this._acpSessionRepository) {
      const dbPath = join(getAppEnvironment().getPath('userData'), 'acp-sessions.db')
      this._acpSessionRepository = new AcpSessionRepository(new AcpSessionDatabase(dbPath))
    }
    return this._acpSessionRepository
  }

  getAcpKernel(): ReturnType<typeof buildAcpKernel> {
    if (!this._acpKernel) {
      this._acpKernel = buildAcpKernel({
        acpSessions: this.getAcpSessionRepository() as never,
        todos: this.getTodoRepository() as never,
        broadcast: broadcastAcpEvent,
        now: () => new Date().toISOString()
      })
    }
    return this._acpKernel
  }

  // Why: assembled in main-process land so the loop runs headless/SSH-friendly,
  // calling executeRouter directly (no renderer round-trip). Config lives in
  // GlobalSettings so a single global switch gates all autonomous pickup.
  getTodoOrchestratorService(): TodoOrchestratorService {
    if (!this._todoOrchestratorService) {
      const repo = this.getTodoRepository()
      const kernel = this.getAcpKernel()
      this._todoOrchestratorService = new TodoOrchestratorService({
        listCandidates: () => repo.listAutoPilotCandidates(),
        updateStatus: (id, status) => {
          repo.updateItem(id, { status })
        },
        resolveCwd: (item) => {
          const project = repo.listProjects().find((p) => p.id === item.projectId)
          const cwd = resolveWorkspaceProjectCwd(
            item.workspaceProjectId,
            this.store?.getProjectHostSetups?.() ?? [],
            project?.defaultWorkingDir ?? null
          )
          return cwd.trim().length > 0 ? cwd : null
        },
        dispatch: (input) => kernel.executeRouter.executeEnginePrompt(input),
        getConfig: () =>
          this.store?.getSettings().todoOrchestrator ?? DEFAULT_TODO_ORCHESTRATOR_CONFIG,
        getDesignStageSkill: () =>
          this.store?.getSettings().todoDesignStageSkill ?? DEFAULT_TODO_DESIGN_STAGE_SKILL,
        getWorkspaceOrcaDirName: () => resolveWorkspaceOrcaDirName(this.store?.getSettings())
      })
    }
    return this._todoOrchestratorService
  }

  protected async flushWorkspaceSessionOrThrowAsync(): Promise<void> {
    const store = this.store
    if (store?.flushPendingOrThrowAsync) {
      await store.flushPendingOrThrowAsync({ drainToStableGeneration: false })
      return
    }
    if (store?.flushOrThrow) {
      store.flushOrThrow()
      return
    }
    throw new Error('workspace_session_persistence_unavailable')
  }

  async reconcileLegacyWorkerTerminals(
    options: { connectionId?: string; materializeRenderer?: boolean } = {}
  ): Promise<LegacyWorkerTerminalRecoveryResult> {
    return this.legacyWorkerRecovery.reconcile(options)
  }

  protected updateLegacyWorkerTerminalRecoveryRetry(
    plan: LegacyWorkerTerminalRecoveryPlan,
    deferredDispatchIds: ReadonlySet<string>,
    options: { connectionId?: string; materializeRenderer?: boolean }
  ): void {
    this.legacyWorkerRecovery.updateRetry(plan, deferredDispatchIds, options)
  }

  async refreshRestoredOrchestrationAuthority(connectionId: string | null = null): Promise<void> {
    if (connectionId === null && !this.canRecoverPersistentLocalPtysFn()) {
      return
    }
    const inventory = await this.refreshPtyWorktreeRecordsWithControllerInventory(
      [...(await this.getResolvedWorktreeMap()).values()],
      null,
      undefined,
      connectionId
    )
    if (!inventory) {
      throw new Error('terminal_liveness_unavailable')
    }
  }

  protected hasExactTerminalSurfaceIdentity(expected: {
    worktreeId: string
    tabId: string
    leafId: string
    ptyId: string
    terminalHandle: string
    incarnationId: string
  }): boolean {
    if (this.graphStatus !== 'ready') {
      return false
    }
    const pty = this.ptysById.get(expected.ptyId)
    if (
      !pty?.connected ||
      pty.incarnationId !== expected.incarnationId ||
      pty.tabId !== expected.tabId ||
      pty.paneKey !== makePaneKey(expected.tabId, expected.leafId) ||
      !runtimeWorktreeIdsEqual(pty.worktreeId, expected.worktreeId) ||
      this.handleByPtyId.get(expected.ptyId) !== expected.terminalHandle
    ) {
      return false
    }
    const tab = this.tabs.get(expected.tabId)
    const leaf = this.leaves.get(this.getLeafKey(expected.tabId, expected.leafId))
    const ptyLeaves = this.getLeavesForPty(expected.ptyId)
    return (
      Boolean(tab && runtimeWorktreeIdsEqual(tab.worktreeId, expected.worktreeId)) &&
      Boolean(
        leaf &&
        leaf.ptyId === expected.ptyId &&
        runtimeWorktreeIdsEqual(leaf.worktreeId, expected.worktreeId)
      ) &&
      ptyLeaves.length === 1 &&
      ptyLeaves[0]?.tabId === expected.tabId &&
      ptyLeaves[0]?.leafId === expected.leafId
    )
  }
}
