// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'

function workspacePort(port: number, advertisedUrl?: string): WorkspacePort {
  return {
    id: `p${port}`,
    bindHost: '0.0.0.0',
    connectHost: 'localhost',
    port,
    protocol: 'http',
    kind: 'workspace',
    owner: { worktreeId: 't', repoId: 't', displayName: 't', path: '/x', confidence: 'cwd' },
    ...(advertisedUrl ? { advertisedUrl } : {})
  } as WorkspacePort
}

const scanPorts = vi.fn()

beforeEach(() => {
  ;(window as unknown as { api: unknown }).api = {
    todos: { review: { scanPorts } }
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const { ReviewBrowserPane } = await import('./ReviewBrowserPane')

describe('ReviewBrowserPane', () => {
  it('scans on mount and fills the URL from the first detected port', async () => {
    scanPorts.mockResolvedValue([workspacePort(5173)])
    render(<ReviewBrowserPane taskId="t1" />)
    expect(scanPorts).toHaveBeenCalledWith({ taskId: 't1' })
    expect(await screen.findByDisplayValue('http://localhost:5173')).toBeInTheDocument()
  })

  it('shows a manual URL field when no ports are detected', async () => {
    scanPorts.mockResolvedValue([])
    render(<ReviewBrowserPane taskId="t1" />)
    const input = (await screen.findByPlaceholderText(/http/i)) as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('toggles mobile viewport', async () => {
    scanPorts.mockResolvedValue([workspacePort(3000)])
    render(<ReviewBrowserPane taskId="t1" />)
    await screen.findByDisplayValue('http://localhost:3000')
    const mobileBtn = screen.getByRole('button', { name: /mobile/i })
    fireEvent.click(mobileBtn)
    expect(mobileBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
