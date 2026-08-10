import type { OpenFile } from '@/store/slices/editor'

// Why: these modes park a synthetic tab id in `filePath`, so every piece of
// file chrome (path header, copy path, reveal in folder) must stay hidden.
// Typed as `OpenFile['mode'][]` so renaming a mode breaks typecheck instead of
// silently un-gating the tab.
const VIRTUAL_EDITOR_TAB_MODES: readonly OpenFile['mode'][] = ['check-details', 'json-formatter']

export function isVirtualEditorTabMode(file: OpenFile): boolean {
  return VIRTUAL_EDITOR_TAB_MODES.includes(file.mode)
}
