// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { OrcaDirectoryNameSettings } from './OrcaDirectoryNameSettings'

const settings = {
  workspaceOrcaDirName: '.orca',
  homeOrcaDirName: '.orca'
} as unknown as GlobalSettings

describe('OrcaDirectoryNameSettings', () => {
  afterEach(() => {
    cleanup()
  })

  it('commits a valid workspace directory name on blur', () => {
    const updateSettings = vi.fn()
    render(<OrcaDirectoryNameSettings settings={settings} updateSettings={updateSettings} />)
    const input = screen.getByLabelText(/workspace orca directory/i)
    fireEvent.change(input, { target: { value: '.tmp/orca' } })
    fireEvent.blur(input)
    expect(updateSettings).toHaveBeenCalledWith({ workspaceOrcaDirName: '.tmp/orca' })
  })

  it('refuses to commit an invalid workspace name and shows an error', () => {
    const updateSettings = vi.fn()
    render(<OrcaDirectoryNameSettings settings={settings} updateSettings={updateSettings} />)
    const input = screen.getByLabelText(/workspace orca directory/i)
    fireEvent.change(input, { target: { value: '../escape' } })
    fireEvent.blur(input)
    expect(updateSettings).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('refuses a separator in the home directory name', () => {
    const updateSettings = vi.fn()
    render(<OrcaDirectoryNameSettings settings={settings} updateSettings={updateSettings} />)
    const input = screen.getByLabelText(/home orca directory/i)
    fireEvent.change(input, { target: { value: '.tmp/orca' } })
    fireEvent.blur(input)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('resets to the default', () => {
    const updateSettings = vi.fn()
    render(
      <OrcaDirectoryNameSettings
        settings={{ ...settings, workspaceOrcaDirName: '.tmp/orca' } as GlobalSettings}
        updateSettings={updateSettings}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /reset workspace/i }))
    expect(updateSettings).toHaveBeenCalledWith({ workspaceOrcaDirName: '.orca' })
  })
})
