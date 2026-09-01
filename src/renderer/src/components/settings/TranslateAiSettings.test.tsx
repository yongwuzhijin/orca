// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  DEFAULT_TRANSLATE_AI_BASE_URL,
  DEFAULT_TRANSLATE_AI_MODEL
} from '../../../../shared/translate-ai-defaults'
import { useAppStore } from '../../store'
import { TranslateAiSettings } from './TranslateAiSettings'

const baseSettings = {
  translateAiBaseUrl: DEFAULT_TRANSLATE_AI_BASE_URL,
  translateAiModel: DEFAULT_TRANSLATE_AI_MODEL
} as unknown as GlobalSettings

describe('TranslateAiSettings', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    window.api = {
      translation: {
        getAiApiKeyStatus: vi.fn().mockResolvedValue({ configured: false }),
        saveAiApiKey: vi.fn().mockResolvedValue({ configured: true }),
        clearAiApiKey: vi.fn().mockResolvedValue({ configured: false })
      }
    } as never
  })

  afterEach(() => {
    cleanup()
  })

  it('commits base URL and model on blur', async () => {
    const updateSettings = vi.fn()
    render(<TranslateAiSettings settings={baseSettings} updateSettings={updateSettings} />)

    await waitFor(() => {
      expect(window.api.translation.getAiApiKeyStatus).toHaveBeenCalled()
    })

    const baseUrlInput = screen.getByLabelText(/base url/i)
    fireEvent.change(baseUrlInput, { target: { value: 'https://api.example.com/v1' } })
    fireEvent.blur(baseUrlInput)
    expect(updateSettings).toHaveBeenCalledWith({
      translateAiBaseUrl: 'https://api.example.com/v1'
    })

    const modelInput = screen.getByLabelText(/^model$/i)
    fireEvent.change(modelInput, { target: { value: 'custom-model' } })
    fireEvent.blur(modelInput)
    expect(updateSettings).toHaveBeenCalledWith({ translateAiModel: 'custom-model' })
  })

  it('shows Add API key when no key is configured', async () => {
    render(<TranslateAiSettings settings={baseSettings} updateSettings={vi.fn()} />)

    await waitFor(() => {
      expect(window.api.translation.getAiApiKeyStatus).toHaveBeenCalled()
    })

    expect(screen.getByRole('button', { name: /add api key/i })).toBeInTheDocument()
    expect(screen.queryByText(/connected/i)).not.toBeInTheDocument()
  })
})
