// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

let mockNames: string[] = []
let mockLoading = false
const readFile = vi.fn()

vi.mock('./use-design-doc-files', () => ({
  useDesignDocFiles: () => ({
    dirPath: '/repo/.orca/design/ORCA-12',
    connectionId: undefined,
    names: mockNames,
    loading: mockLoading,
    refresh: vi.fn()
  })
}))

const { DesignDocPane } = await import('./DesignDocPane')

function mkItem(): TodoItem {
  return {
    id: 't1',
    identifier: 'ORCA-12',
    projectId: 'p1',
    title: 'Ship feature',
    description: '',
    status: 'solution_design',
    priority: 'none',
    scheduledDate: null,
    estimate: null,
    labels: [],
    templateId: null,
    orderKey: 't1',
    createdAt: '',
    updatedAt: '',
    startedAt: null,
    completedAt: null,
    sessionId: null,
    workspaceProjectId: 'wp-1',
    workspaceName: null,
    preferredAgent: null,
    autoPilotEnabled: false,
    autoPilotMaxTurns: null,
    designStageEnabled: true
  }
}

describe('DesignDocPane', () => {
  beforeEach(() => {
    mockNames = []
    mockLoading = false
    readFile.mockResolvedValue({ content: '', isBinary: false })
    ;(window as unknown as { api: unknown }).api = { fs: { readFile } }
  })

  afterEach(() => {
    cleanup()
    delete (window as unknown as { api?: unknown }).api
    vi.clearAllMocks()
  })

  it('invites a refresh while the skill has not written any document yet', () => {
    render(<DesignDocPane item={mkItem()} />)

    expect(screen.getByText(/no design documents yet/i)).toBeInTheDocument()
  })

  it('holds the empty copy back while the directory read is still in flight', () => {
    mockLoading = true

    render(<DesignDocPane item={mkItem()} />)

    expect(screen.queryByText(/no design documents yet/i)).not.toBeInTheDocument()
  })

  it('reads and renders the first document on the workspace host', async () => {
    mockNames = ['api.md', 'overview.md']
    readFile.mockResolvedValue({ content: '# Overview\n\nThe plan.', isBinary: false })

    render(<DesignDocPane item={mkItem()} />)

    expect(await screen.findByText('Overview')).toBeInTheDocument()
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile.mock.calls[0]?.[0]).toStrictEqual({
      filePath: '/repo/.orca/design/ORCA-12/api.md',
      connectionId: undefined
    })
  })

  it('switches documents when another file is picked', async () => {
    mockNames = ['api.md', 'overview.md']
    readFile.mockImplementation(({ filePath }: { filePath: string }) =>
      Promise.resolve({
        content: filePath.endsWith('overview.md') ? '# Overview' : '# API',
        isBinary: false
      })
    )

    render(<DesignDocPane item={mkItem()} />)
    expect(await screen.findByText('API')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'overview.md' }))

    expect(await screen.findByText('Overview')).toBeInTheDocument()
  })

  // Why: a remote relay returns base64 for a .md it judges binary, which must not reach the renderer.
  it('renders nothing for a document the host reports as binary', async () => {
    mockNames = ['notes.md', 'overview.md']
    readFile.mockImplementation(({ filePath }: { filePath: string }) =>
      Promise.resolve(
        filePath.endsWith('notes.md')
          ? { content: '# Notes', isBinary: false }
          : { content: 'QUFBQUFB', isBinary: true }
      )
    )

    render(<DesignDocPane item={mkItem()} />)
    expect(await screen.findByText('Notes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'overview.md' }))

    await waitFor(() => expect(screen.queryByText('Notes')).not.toBeInTheDocument())
    expect(screen.queryByText('QUFBQUFB')).not.toBeInTheDocument()
  })
})
