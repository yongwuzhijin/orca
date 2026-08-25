// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DesignDocPane } from './DesignDocPane'
import type { DesignDocFiles } from './use-design-doc-files'

const readFile = vi.fn()

function mkDocFiles(overrides: Partial<DesignDocFiles> = {}): DesignDocFiles {
  return {
    dirPath: '/repo/.orca/design/ORCA-12',
    names: [],
    loading: false,
    refresh: vi.fn(),
    ...overrides
  }
}

describe('DesignDocPane', () => {
  beforeEach(() => {
    readFile.mockResolvedValue({ content: '', isBinary: false })
    ;(window as unknown as { api: unknown }).api = { fs: { readFile } }
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
    vi.clearAllMocks()
  })

  it('invites a refresh while the skill has not written any document yet', () => {
    render(<DesignDocPane docFiles={mkDocFiles()} />)

    expect(screen.getByText(/no design documents yet/i)).toBeInTheDocument()
  })

  it('holds the empty copy back while the directory read is still in flight', () => {
    render(<DesignDocPane docFiles={mkDocFiles({ loading: true })} />)

    expect(screen.queryByText(/no design documents yet/i)).not.toBeInTheDocument()
  })

  it('reads and renders the first document on the workspace host', async () => {
    readFile.mockResolvedValue({ content: '# Overview\n\nThe plan.', isBinary: false })

    render(<DesignDocPane docFiles={mkDocFiles({ names: ['api.md', 'overview.md'] })} />)

    expect(await screen.findByText('Overview')).toBeInTheDocument()
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile.mock.calls[0]?.[0]).toStrictEqual({
      filePath: '/repo/.orca/design/ORCA-12/api.md',
      connectionId: undefined
    })
  })

  it('switches documents when another file is picked', async () => {
    readFile.mockImplementation(({ filePath }: { filePath: string }) =>
      Promise.resolve({
        content: filePath.endsWith('overview.md') ? '# Overview' : '# API',
        isBinary: false
      })
    )

    render(<DesignDocPane docFiles={mkDocFiles({ names: ['api.md', 'overview.md'] })} />)
    expect(await screen.findByText('API')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'overview.md' }))

    expect(await screen.findByText('Overview')).toBeInTheDocument()
  })

  // Why: a remote relay returns base64 for a .md it judges binary, which must not reach the renderer.
  it('renders nothing for a document the host reports as binary', async () => {
    readFile.mockImplementation(({ filePath }: { filePath: string }) =>
      Promise.resolve(
        filePath.endsWith('notes.md')
          ? { content: '# Notes', isBinary: false }
          : { content: 'QUFBQUFB', isBinary: true }
      )
    )

    render(<DesignDocPane docFiles={mkDocFiles({ names: ['notes.md', 'overview.md'] })} />)
    expect(await screen.findByText('Notes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'overview.md' }))

    await waitFor(() => expect(screen.queryByText('Notes')).not.toBeInTheDocument())
    expect(screen.queryByText('QUFBQUFB')).not.toBeInTheDocument()
  })
})
