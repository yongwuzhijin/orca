/* eslint-disable max-lines -- Why: shared type definitions for all runtime RPC methods live in one file for discoverability and import simplicity. */
import type {
  AgentStatusEntry,
  AgentStatusOrchestrationContext,
  AgentStatusState
} from './agent-status-types'
import type { AgentType } from './agent-type'
import type {
  BrowserCertificateFailure,
  BrowserCookieImportResult,
  BrowserLoadError,
  BrowserSessionProfile,
  BrowserSessionProfileSource
} from './browser-workspace-types'
import type { BaseRefSearchResult, Repo } from './repo-types'
import type { TabGroupLayoutNode } from './tab-types'
import type { TerminalColorOverrides } from './terminal-color-overrides'
import type { TerminalLayoutSnapshot, TerminalPaneLayoutNode } from './terminal-tab-types'
import type { TuiAgent } from './tui-agent'
import type { CreateWorktreeResult, RemoveWorktreeResult } from './worktree/create-types'
import type {
  WorkspaceLineage,
  WorktreeLineage,
  WorktreeLineageWarning
} from './worktree/lineage-types'
import type { GitWorktreeInfo, Worktree } from './worktree/types'
import type {
  RuntimeMarkdownReadTabResult,
  RuntimeMarkdownSaveTabResult
} from './mobile-markdown-document'
