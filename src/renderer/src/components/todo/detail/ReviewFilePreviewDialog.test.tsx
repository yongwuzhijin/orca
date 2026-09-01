// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewFilePreviewDialog } from './ReviewFilePreviewDialog'

const openFile = vi.fn()
const closeFile = vi.fn()
const makePreviewFilePermanent = vi.fn()

vi.mock('@/components/editor/EditorPanel', () => ({
  default: ({ activeFileId }: { activeFileId?: string | null }) => (
    <div data-testid="embedded-editor">{activeFileId}</div>
  )
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        openFile,
        closeFile,
        makePreviewFilePermanent,
        openFiles: [{ id: '/repo/README.md', isPreview: true }]
      }),
    {
      getState: () => ({
        openFiles: [{ id: '/repo/README.md', isPreview: true }]
      })
    }
  )
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReviewFilePreviewDialog', () => {
  it('embeds EditorPanel for the opened preview file', async () => {
    openFile.mockReturnValue('/repo/README.md')

    render(
      <ReviewFilePreviewDialog
        preview={{
          filePath: '/repo/README.md',
          relativePath: 'README.md',
          fileName: 'README.md',
          worktreeId: 'wt-1'
        }}
        onClose={vi.fn()}
      />
    )

    expect(openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/repo/README.md',
        worktreeId: 'wt-1',
        language: 'markdown'
      }),
      { preview: true, focusEditor: false }
    )
    await waitFor(() => {
      expect(screen.getByTestId('embedded-editor')).toHaveTextContent('/repo/README.md')
    })
  })

  it('pins the preview tab and focuses the workspace editor when requested', async () => {
    openFile.mockReturnValue('/repo/src/app.ts')
    const onClose = vi.fn()

    render(
      <ReviewFilePreviewDialog
        preview={{
          filePath: '/repo/src/app.ts',
          relativePath: 'src/app.ts',
          fileName: 'app.ts',
          worktreeId: 'wt-1'
        }}
        onClose={onClose}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('embedded-editor')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /open in workspace editor/i }))

    expect(makePreviewFilePermanent).toHaveBeenCalledWith('/repo/src/app.ts')
    expect(openFile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filePath: '/repo/src/app.ts',
        worktreeId: 'wt-1',
        language: 'typescript'
      }),
      { focusEditor: true }
    )
    expect(onClose).toHaveBeenCalled()
    expect(closeFile).not.toHaveBeenCalled()
  })

  it('toggles full screen from the dialog chrome', async () => {
    openFile.mockReturnValue('/repo/README.md')

    render(
      <ReviewFilePreviewDialog
        preview={{
          filePath: '/repo/README.md',
          relativePath: 'README.md',
          fileName: 'README.md',
          worktreeId: 'wt-1'
        }}
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('embedded-editor')).toBeInTheDocument()
    })

    const dialog = screen.getByRole('dialog')
    expect(dialog.className).not.toContain('inset-0')

    await userEvent.click(screen.getByRole('button', { name: /full screen/i }))
    expect(dialog.className).toContain('inset-0')

    await userEvent.click(screen.getByRole('button', { name: /exit full screen/i }))
    expect(dialog.className).not.toContain('inset-0')
  })

  it('closes from the dialog chrome without overlapping the editor header', async () => {
    openFile.mockReturnValue('/repo/README.md')
    const onClose = vi.fn()

    render(
      <ReviewFilePreviewDialog
        preview={{
          filePath: '/repo/README.md',
          relativePath: 'README.md',
          fileName: 'README.md',
          worktreeId: 'wt-1'
        }}
        onClose={onClose}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('embedded-editor')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /^close$/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
