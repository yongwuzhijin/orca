// @vitest-environment happy-dom

// Why: virtual editor tabs (check-details, json-formatter) put a synthetic tab
// id in `filePath`, so any content load would resolve a path that cannot exist.
// The mode gate in useEditorPanelContentState is what prevents it; these tests
// prove that empirically instead of by reading the gate.
//
// Lives apart from useEditorPanelContentState.test.tsx because that file already
// sits one counted line under the 800-line oxlint budget.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'

const mocks = vi.hoisted(() => ({
  readRuntimeFileContent: vi.fn(),
  getRuntimeGitDiff: vi.fn(),
  getRuntimeGitBranchDiff: vi.fn(),
  getConnectionId: vi.fn(),
  getConnectionIdForFile: vi.fn(),
  isWorktreeConnectionResolved: vi.fn(() => true),
  getState: vi.fn()
}))

vi.mock('@/runtime/runtime-file-client', () => ({
  getRuntimeFileReadScope: vi.fn(() => null),
  readRuntimeFileContent: mocks.readRuntimeFileContent,
  subscribeRuntimeFileChanges: vi.fn()
}))

vi.mock('@/runtime/runtime-git-client', () => ({
  getRuntimeGitBranchDiff: mocks.getRuntimeGitBranchDiff,
  getRuntimeGitCommitDiff: vi.fn(),
  getRuntimeGitDiff: mocks.getRuntimeGitDiff,
  getRuntimeGitScope: vi.fn(() => null)
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: mocks.getConnectionId,
  getConnectionIdForFile: mocks.getConnectionIdForFile,
  isWorktreeConnectionResolved: mocks.isWorktreeConnectionResolved
}))

vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: vi.fn(() => null)
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: mocks.getState }
}))

import { useEditorPanelContentState } from './useEditorPanelContentState'
import type { FileContent } from './editor-panel-content-types'

const authorizeExternalPath = vi.fn()
let latestFileContents: Record<string, FileContent> = {}

function HookProbe({ activeFile }: { activeFile: OpenFile }): null {
  const state = useEditorPanelContentState({
    activeFile,
    isChangesMode: false,
    openFiles: [activeFile],
    gitStatusEntries: undefined,
    editorViewMode: {}
  })
  latestFileContents = state.fileContents
  return null
}

const JSON_FORMATTER_TAB: OpenFile = {
  id: 'wt-1::json-formatter',
  filePath: 'wt-1::json-formatter',
  relativePath: 'wt-1::json-formatter',
  worktreeId: 'wt-1',
  language: 'json',
  isDirty: false,
  mode: 'json-formatter',
  jsonFormatter: { input: '{"a":1}', keepEscapes: true, showLineNumbers: false }
}

const CHECK_DETAILS_TAB: OpenFile = {
  id: 'wt-1::check-details::check-run:99',
  filePath: 'wt-1::check-details::check-run:99',
  relativePath: 'verify',
  worktreeId: 'wt-1',
  language: 'plaintext',
  isDirty: false,
  mode: 'check-details'
}

describe('virtual editor tab content loading', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    latestFileContents = {}
    authorizeExternalPath.mockReset()
    authorizeExternalPath.mockResolvedValue(undefined)
    ;(window as unknown as { api: unknown }).api = {
      fs: { authorizeExternalPath, onLocalLogTailChanged: vi.fn(() => () => {}) }
    }
    mocks.readRuntimeFileContent.mockReset()
    mocks.readRuntimeFileContent.mockResolvedValue({ content: 'must not load', isBinary: false })
    mocks.getRuntimeGitDiff.mockReset()
    mocks.getRuntimeGitBranchDiff.mockReset()
    mocks.getConnectionId.mockReset()
    mocks.getConnectionIdForFile.mockReset()
    mocks.isWorktreeConnectionResolved.mockReset()
    mocks.isWorktreeConnectionResolved.mockReturnValue(true)
    mocks.getState.mockReset()
    mocks.getState.mockReturnValue({
      settings: null,
      openFiles: [],
      setLastKnownDiskSignature: vi.fn()
    })
  })

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    container?.remove()
    container = null
    root = null
  })

  async function mountTab(activeFile: OpenFile): Promise<void> {
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    await act(async () => {
      root?.render(<HookProbe activeFile={activeFile} />)
    })
    // Drain any load promise the effect could have started.
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('never reads the filesystem for a json formatter tab', async () => {
    await mountTab(JSON_FORMATTER_TAB)

    expect(mocks.readRuntimeFileContent).not.toHaveBeenCalled()
    expect(mocks.getRuntimeGitDiff).not.toHaveBeenCalled()
    expect(authorizeExternalPath).not.toHaveBeenCalled()
    expect(latestFileContents[JSON_FORMATTER_TAB.id]).toBeUndefined()
  })

  it('never reads the filesystem for a check-details tab', async () => {
    await mountTab(CHECK_DETAILS_TAB)

    expect(mocks.readRuntimeFileContent).not.toHaveBeenCalled()
    expect(latestFileContents[CHECK_DETAILS_TAB.id]).toBeUndefined()
  })

  it('still reads the filesystem for an ordinary edit tab', async () => {
    // Why: pins the negatives above to the mode gate rather than to a broken harness.
    await mountTab({
      id: '/repo/file.ts',
      filePath: '/repo/file.ts',
      relativePath: 'file.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      isDirty: false,
      mode: 'edit'
    })

    await vi.waitFor(() => expect(mocks.readRuntimeFileContent).toHaveBeenCalledTimes(1))
  })
})
