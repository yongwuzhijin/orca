// @vitest-environment happy-dom

// Why: the shell's header gate is the only enforcement point that keeps a
// virtual editor tab's synthetic id (`wt-1::json-formatter`) from being rendered
// as a copyable file path. Prove it by mounting, not by reading the condition.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenFile } from '@/store/slices/editor'

vi.mock('@/store', () => ({
  useAppStore: { getState: vi.fn(() => ({ worktreesByRepo: {} })) }
}))

vi.mock('./EditorPanelHeader', () => ({
  EditorPanelHeader: ({ activeFile }: { activeFile: OpenFile }) => (
    <div data-testid="editor-panel-header">{activeFile.filePath}</div>
  )
}))

vi.mock('./EditorContent', () => ({
  EditorContent: () => <div data-testid="editor-content" />
}))

vi.mock('./UntitledFileRenameDialog', () => ({
  UntitledFileRenameDialog: () => null
}))

import { EditorPanelShell } from './EditorPanelShell'
import { getEditorPanelRenderModel } from './editor-panel-render-model'

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

const EDIT_TAB: OpenFile = {
  id: '/repo/file.ts',
  filePath: '/repo/file.ts',
  relativePath: 'file.ts',
  worktreeId: 'wt-1',
  language: 'typescript',
  isDirty: false,
  mode: 'edit'
}

const noop = (): void => {}
const asyncNoop = async (): Promise<boolean> => true

function makeShellProps(activeFile: OpenFile): React.ComponentProps<typeof EditorPanelShell> {
  return {
    panelRef: null,
    activeFile,
    activeViewStateId: null,
    model: getEditorPanelRenderModel({
      activeFile,
      fileContents: {},
      editorDrafts: {},
      gitStatusEntries: undefined,
      gitBranchEntries: undefined,
      markdownViewMode: {},
      markdownRichModeSizeOverridden: false,
      isChangesMode: false,
      canOpenWorkspaceFileBrowser: false
    }),
    copiedPathVisible: false,
    showMarkdownTableOfContents: false,
    canShowMarkdownFrontmatterToggle: false,
    markdownFrontmatterVisible: false,
    sideBySide: false,
    openFiles: [activeFile],
    fileContents: {},
    diffContents: {},
    editorDrafts: {},
    pendingEditorReveal: null,
    renameDialogFile: null,
    renameError: null,
    disableRenameBrowse: false,
    onCopyPath: noop,
    onOpenDiffTargetFile: noop,
    onOpenPreviewToSide: noop,
    onOpenMarkdownPreview: noop,
    onOpenContainingFolder: noop,
    onToggleSideBySide: noop,
    onEditorToggleChange: noop,
    onToggleMarkdownTableOfContents: noop,
    onToggleMarkdownFrontmatter: noop,
    onExportMarkdownToPdf: noop,
    onContentChange: noop,
    onContentChangeForFile: noop,
    onDirtyStateHint: noop,
    onSave: asyncNoop,
    onSaveForFile: asyncNoop,
    onReloadContent: noop,
    onCloseMarkdownTableOfContents: noop,
    onCloseRenameDialog: noop,
    onRenameConfirm: async () => {},
    markdownAnnotationsEnabled: false
  }
}

describe('EditorPanelShell header gate', () => {
  let container: HTMLDivElement | null = null
  let root: Root | null = null

  beforeEach(() => {
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
    }
    container?.remove()
    container = null
    root = null
  })

  function mountShell(activeFile: OpenFile): void {
    act(() => {
      root?.render(<EditorPanelShell {...makeShellProps(activeFile)} />)
    })
  }

  it('hides the file-path header for a json formatter tab', () => {
    mountShell(JSON_FORMATTER_TAB)

    expect(container?.querySelector('[data-testid="editor-panel-header"]')).toBeNull()
    expect(container?.textContent).not.toContain('wt-1::json-formatter')
    // Why: pins the negative to the header gate, not to a shell that failed to render.
    expect(container?.querySelector('[data-testid="editor-content"]')).not.toBeNull()
  })

  it('hides the file-path header for a check details tab', () => {
    mountShell(CHECK_DETAILS_TAB)

    expect(container?.querySelector('[data-testid="editor-panel-header"]')).toBeNull()
  })

  it('still renders the file-path header for an ordinary edit tab', () => {
    mountShell(EDIT_TAB)

    const header = container?.querySelector('[data-testid="editor-panel-header"]')
    expect(header).not.toBeNull()
    expect(header?.textContent).toBe('/repo/file.ts')
  })
})
