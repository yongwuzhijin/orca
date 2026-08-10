import { describe, expect, it } from 'vitest'
import { isVirtualEditorTabMode } from './virtual-editor-tab-mode'
import type { OpenFile } from '@/store/slices/editor'

function makeOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/repo/file.ts',
    filePath: '/repo/file.ts',
    relativePath: 'file.ts',
    worktreeId: 'wt-1',
    language: 'typescript',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

describe('isVirtualEditorTabMode', () => {
  it('flags the json formatter tool tab', () => {
    expect(
      isVirtualEditorTabMode(
        makeOpenFile({
          id: 'wt-1::json-formatter',
          filePath: 'wt-1::json-formatter',
          relativePath: 'wt-1::json-formatter',
          language: 'json',
          mode: 'json-formatter',
          jsonFormatter: { input: '', keepEscapes: true, showLineNumbers: false }
        })
      )
    ).toBe(true)
  })

  it('flags the check details tab', () => {
    expect(
      isVirtualEditorTabMode(
        makeOpenFile({
          id: 'wt-1::check-details::check-run:99',
          filePath: 'wt-1::check-details::check-run:99',
          relativePath: 'verify',
          mode: 'check-details'
        })
      )
    ).toBe(true)
  })

  it.each(['edit', 'diff', 'conflict-review', 'markdown-preview'] satisfies OpenFile['mode'][])(
    'leaves file-backed %s tabs alone',
    (mode) => {
      expect(isVirtualEditorTabMode(makeOpenFile({ mode }))).toBe(false)
    }
  )
})
