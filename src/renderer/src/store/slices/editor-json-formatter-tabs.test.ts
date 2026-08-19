import { describe, expect, it, vi } from 'vitest'
import { createEditorTabsStore } from './editor-slice-test-harness'
import type { AppState } from '../types'

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock }
}))

const { notifyHostOfMirroredEditorCloseMock } = vi.hoisted(() => ({
  notifyHostOfMirroredEditorCloseMock: vi.fn()
}))
vi.mock('@/runtime/close-mirrored-editor-tab', () => ({
  notifyHostOfMirroredEditorClose: (...args: unknown[]) =>
    notifyHostOfMirroredEditorCloseMock(...args)
}))

describe('createEditorSlice JSON formatter tab', () => {
  const jsonFormatterId = 'wt-1::json-formatter'

  it('keeps the typed input when the tool is reopened', () => {
    const store = createEditorTabsStore()

    store.getState().openJsonFormatter('wt-1')
    store.getState().updateJsonFormatterState(jsonFormatterId, {
      input: '{"a":1}',
      keepEscapes: false
    })
    store.getState().openJsonFormatter('wt-1')

    const formatterFiles = store.getState().openFiles.filter((file) => file.id === jsonFormatterId)

    expect(formatterFiles).toHaveLength(1)
    expect(formatterFiles[0].jsonFormatter).toEqual({
      input: '{"a":1}',
      keepEscapes: false,
      showLineNumbers: false
    })
  })

  it('gives each split group its own header over one shared payload', () => {
    const store = createEditorTabsStore()

    store.getState().openJsonFormatter('wt-1')
    const firstGroupId = store.getState().groupsByWorktree['wt-1']?.[0]?.id
    if (!firstGroupId) {
      throw new Error('Expected a group for the first formatter header')
    }
    const secondGroupId = store.getState().createEmptySplitGroup('wt-1', firstGroupId, 'right')
    if (!secondGroupId) {
      throw new Error('Expected split group')
    }
    // Keep the first group focused so only the explicit target can route the second header.
    store.setState({ activeGroupIdByWorktree: { 'wt-1': firstGroupId } } as Partial<AppState>)

    store.getState().openJsonFormatter('wt-1', { targetGroupId: secondGroupId })

    const headers =
      store
        .getState()
        .unifiedTabsByWorktree['wt-1']?.filter((tab) => tab.entityId === jsonFormatterId) ?? []

    expect(headers).toHaveLength(2)
    expect(new Set(headers.map((tab) => tab.id)).size).toBe(2)
    expect(new Set(headers.map((tab) => tab.groupId))).toEqual(
      new Set([firstGroupId, secondGroupId])
    )
    expect(store.getState().openFiles.filter((file) => file.id === jsonFormatterId)).toHaveLength(1)
  })

  it('keeps openFiles identity when patching an unknown or payload-less file id', () => {
    const store = createEditorTabsStore()

    store.getState().openFile({
      filePath: '/repo/other.ts',
      relativePath: 'other.ts',
      worktreeId: 'wt-1',
      language: 'typescript',
      mode: 'edit'
    })

    const beforeUnknown = store.getState().openFiles
    store.getState().updateJsonFormatterState(jsonFormatterId, { input: '{}' })
    expect(store.getState().openFiles).toBe(beforeUnknown)

    const beforePayloadLess = store.getState().openFiles
    store.getState().updateJsonFormatterState('/repo/other.ts', { input: '{}' })
    expect(store.getState().openFiles).toBe(beforePayloadLess)
  })

  it('keeps openFiles identity when a patch repeats the values already held', () => {
    const store = createEditorTabsStore()
    const payload = { input: '{"a":1}', keepEscapes: false, showLineNumbers: true }

    store.getState().openJsonFormatter('wt-1')
    store.getState().updateJsonFormatterState(jsonFormatterId, payload)

    // Debounced keystrokes replay the whole payload; a toolbar toggle replays one field.
    const beforeFullPatch = store.getState().openFiles
    store.getState().updateJsonFormatterState(jsonFormatterId, payload)
    expect(store.getState().openFiles).toBe(beforeFullPatch)

    const beforePartialPatch = store.getState().openFiles
    store.getState().updateJsonFormatterState(jsonFormatterId, { showLineNumbers: true })
    expect(store.getState().openFiles).toBe(beforePartialPatch)

    expect(
      store.getState().openFiles.find((file) => file.id === jsonFormatterId)?.jsonFormatter
    ).toEqual(payload)
  })

  // Why: the formatter hardcodes isDirty: false, so a previewable header would let preview replacement discard typed JSON.
  it('never opens as a replaceable preview', () => {
    const store = createEditorTabsStore()

    store.getState().openJsonFormatter('wt-1')

    const file = store.getState().openFiles.find((f) => f.id === jsonFormatterId)
    if (!file) {
      throw new Error('Expected the formatter file')
    }
    const header = store
      .getState()
      .unifiedTabsByWorktree['wt-1']?.find((tab) => tab.entityId === jsonFormatterId)
    if (!header) {
      throw new Error('Expected the formatter header')
    }

    expect(file.isPreview).toBeFalsy()
    expect(header.isPreview).toBeFalsy()
  })
})
