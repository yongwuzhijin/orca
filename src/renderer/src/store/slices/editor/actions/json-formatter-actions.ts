import type { EditorGet, EditorSet } from '../types/editor-set-get'
import type { EditorSlice } from '../types/editor-slice'
import type { OpenFile } from '../types/open-file'
import {
  buildJsonFormatterTabId,
  getJsonFormatterTabLabel
} from '@/components/json-formatter/json-formatter-tab'
import { openWorkspaceEditorItem } from '../tabs/workspace-editor-item'

export function createJsonFormatterActions(
  set: EditorSet,
  get: EditorGet
): Pick<EditorSlice, 'openJsonFormatter' | 'updateJsonFormatterState'> {
  return {
    // Why: one payload per worktree, but each split group gets its own header so both sides share the input.
    openJsonFormatter: (worktreeId, options) => {
      const id = buildJsonFormatterTabId(worktreeId)
      const label = getJsonFormatterTabLabel()
      const targetGroupId = options?.targetGroupId

      set((s) => {
        const activation = {
          activeFileId: id,
          activeTabType: 'editor' as const,
          activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
          activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' as const }
        }
        const existing = s.openFiles.find((f) => f.id === id)
        if (existing) {
          // Why: reopening the tool must not wipe what the user already typed, so `jsonFormatter` is left untouched.
          return activation
        }

        const newFile: OpenFile = {
          id,
          filePath: id,
          relativePath: label,
          worktreeId,
          language: 'json',
          isDirty: false,
          mode: 'json-formatter',
          jsonFormatter: { input: '', keepEscapes: true, showLineNumbers: false }
        }

        return { openFiles: [...s.openFiles, newFile], ...activation }
      })
      void openWorkspaceEditorItem(
        get(),
        id,
        worktreeId,
        label,
        'json-formatter',
        undefined,
        targetGroupId
      )
    },

    updateJsonFormatterState: (fileId, patch) => {
      set((s) => {
        const target = s.openFiles.find((f) => f.id === fileId)
        // Why: a debounced write can land after the tab closed — skip it so openFiles keeps its identity.
        if (!target?.jsonFormatter) {
          return s
        }
        const next = { ...target.jsonFormatter, ...patch }
        if (
          next.input === target.jsonFormatter.input &&
          next.keepEscapes === target.jsonFormatter.keepEscapes &&
          next.showLineNumbers === target.jsonFormatter.showLineNumbers
        ) {
          return s
        }
        return {
          openFiles: s.openFiles.map((f) => (f === target ? { ...f, jsonFormatter: next } : f))
        }
      })
    }
  }
}
