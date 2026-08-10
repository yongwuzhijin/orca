import { describe, expect, it } from 'vitest'
import { getEditorDisplayLabel } from './editor-labels'
import { getJsonFormatterTabLabel } from '@/components/json-formatter/json-formatter-tab'
import type { OpenFile } from '@/store/slices/editor'

function makeOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    id: '/repo/docs/README.md',
    filePath: '/repo/docs/README.md',
    relativePath: 'docs/README.md',
    worktreeId: 'wt-1',
    language: 'markdown',
    isDirty: false,
    mode: 'edit',
    ...overrides
  }
}

// Why: relativePath stays synthetic (not the tool label) so a dropped
// 'json-formatter' branch falls back to a visibly different string.
function makeJsonFormatterFile(): OpenFile {
  return makeOpenFile({
    id: 'wt-1::json-formatter',
    filePath: 'wt-1::json-formatter',
    relativePath: 'wt-1::json-formatter',
    language: 'json',
    mode: 'json-formatter',
    jsonFormatter: { input: '', keepEscapes: true, showLineNumbers: false }
  })
}

describe('getEditorDisplayLabel', () => {
  it('adds a preview suffix for markdown preview tabs', () => {
    expect(
      getEditorDisplayLabel(
        makeOpenFile({
          id: 'markdown-preview::/repo/docs/README.md',
          mode: 'markdown-preview'
        })
      )
    ).toBe('README.md (preview)')
  })

  it('uses the requested label variant for markdown preview tabs', () => {
    expect(
      getEditorDisplayLabel(
        makeOpenFile({
          id: 'markdown-preview::/repo/docs/README.md',
          mode: 'markdown-preview'
        }),
        'relativePath'
      )
    ).toBe('docs/README.md (preview)')
  })

  it('names the json formatter tab after the tool, not its synthetic path', () => {
    const label = getEditorDisplayLabel(makeJsonFormatterFile())
    expect(label).toBe(getJsonFormatterTabLabel())
    expect(label).not.toContain('::')
  })

  it('ignores the label variant for the json formatter tab', () => {
    // Why: every variant derives from filePath/relativePath, both synthetic here.
    const file = makeJsonFormatterFile()
    expect(getEditorDisplayLabel(file, 'fullPath')).toBe(getJsonFormatterTabLabel())
    expect(getEditorDisplayLabel(file, 'relativePath')).toBe(getJsonFormatterTabLabel())
  })
})
