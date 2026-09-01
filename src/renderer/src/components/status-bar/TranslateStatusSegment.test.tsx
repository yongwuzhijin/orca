// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DictionaryHeadwordEntry } from '../../../../shared/text-translation-types'
import { TranslateStatusSegment } from './TranslateStatusSegment'

const storeState = {
  recordFeatureInteraction: () => {},
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  settings: { translateDictionaryLookupEnabled: true } as Record<string, unknown>
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof storeState) => unknown) => selector(storeState)
}))

const translateMock = vi.fn()
const translateWithAiMock = vi.fn()
const lookupDictionaryMock = vi.fn()
const getAiApiKeyStatusMock = vi.fn()

beforeEach(() => {
  storeState.settings = { translateDictionaryLookupEnabled: true }
  storeState.openSettingsPage.mockReset()
  storeState.openSettingsTarget.mockReset()
  getAiApiKeyStatusMock.mockReset().mockResolvedValue({ configured: true })
  translateMock.mockReset().mockResolvedValue({
    ok: true,
    translatedText: '依赖的',
    targetLanguage: 'zh-CN',
    detectedSourceLanguage: 'en',
    providerId: 'google-gtx',
    dictionaryEntries: [],
    queriedText: 'dependent'
  })
  translateWithAiMock.mockReset().mockResolvedValue({
    ok: true,
    translatedText: '依赖的',
    targetLanguage: 'zh-CN',
    detectedSourceLanguage: 'en',
    providerId: 'ai',
    dictionaryEntries: [],
    queriedText: 'dependent',
    agentLabel: 'Claude'
  })
  lookupDictionaryMock.mockReset().mockResolvedValue({
    entries: [{ headword: 'dependent', explain: 'adj. 依赖的' }]
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      translation: {
        translate: translateMock,
        translateWithAi: translateWithAiMock,
        cancelAi: vi.fn(),
        lookupDictionary: lookupDictionaryMock,
        getAiApiKeyStatus: getAiApiKeyStatusMock
      },
      ui: { writeClipboardText: vi.fn().mockResolvedValue(undefined) }
    }
  })
})

afterEach(cleanup)

function openAndSubmit(text: string): void {
  render(
    <TooltipProvider>
      <TranslateStatusSegment iconOnly={false} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByLabelText('Translate text'))
  fireEvent.change(screen.getByPlaceholderText(/Type or paste text/), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
}

describe('TranslateStatusSegment', () => {
  it('opens the popover without crashing the status bar', () => {
    render(
      <TooltipProvider>
        <TranslateStatusSegment iconOnly={false} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByLabelText('Translate text'))
    expect(screen.getByPlaceholderText(/Type or paste text/)).toBeTruthy()
  })

  it('looks up the dictionary alongside the translation and shows the headwords', async () => {
    openAndSubmit('dependent')
    await waitFor(() => expect(lookupDictionaryMock).toHaveBeenCalledWith({ text: 'dependent' }))
    await waitFor(() => expect(screen.getByText('adj. 依赖的')).toBeTruthy())
  })

  it('skips the lookup for prose that is past the word-like cap', async () => {
    openAndSubmit('the cache was cold and the request timed out')
    await waitFor(() => expect(translateMock).toHaveBeenCalled())
    expect(lookupDictionaryMock).not.toHaveBeenCalled()
  })

  it('does not look up the dictionary in AI mode', async () => {
    render(
      <TooltipProvider>
        <TranslateStatusSegment iconOnly={false} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByLabelText('Translate text'))
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    fireEvent.change(screen.getByPlaceholderText(/Type or paste text/), {
      target: { value: 'dependent' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await waitFor(() => expect(translateWithAiMock).toHaveBeenCalled())
    expect(lookupDictionaryMock).not.toHaveBeenCalled()
  })

  it('skips the lookup when the setting is off but still translates', async () => {
    storeState.settings = { translateDictionaryLookupEnabled: false }
    openAndSubmit('dependent')
    await waitFor(() => expect(translateMock).toHaveBeenCalled())
    expect(lookupDictionaryMock).not.toHaveBeenCalled()
  })

  it('looks up when settings have not loaded yet, matching the default-on behavior', async () => {
    storeState.settings = {}
    openAndSubmit('dependent')
    await waitFor(() => expect(lookupDictionaryMock).toHaveBeenCalledWith({ text: 'dependent' }))
  })

  it('drops a stale lookup so an earlier word cannot label a newer result', async () => {
    // The first lookup stays in flight until after the second submit has already landed.
    let resolveStale: (response: { entries: DictionaryHeadwordEntry[] }) => void = () => {}
    lookupDictionaryMock.mockImplementationOnce(
      () =>
        new Promise<{ entries: DictionaryHeadwordEntry[] }>((resolve) => {
          resolveStale = resolve
        })
    )
    lookupDictionaryMock.mockResolvedValue({
      entries: [{ headword: 'cold', explain: 'adj. 冷的' }]
    })

    openAndSubmit('dependent')
    await waitFor(() => expect(lookupDictionaryMock).toHaveBeenCalledWith({ text: 'dependent' }))
    fireEvent.change(screen.getByPlaceholderText(/Type or paste text/), {
      target: { value: 'cold' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await waitFor(() => expect(screen.getByText('adj. 冷的')).toBeTruthy())

    resolveStale({ entries: [{ headword: 'dependent', explain: 'adj. 依赖的' }] })
    // A macrotask turn settles the superseded promise; the sequence guard must still reject it.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('adj. 依赖的')).toBeNull()
    expect(screen.getByText('adj. 冷的')).toBeTruthy()
  })

  it('shows an inline reminder and skips AI translation when the API key is missing', async () => {
    getAiApiKeyStatusMock.mockResolvedValue({ configured: false })
    render(
      <TooltipProvider>
        <TranslateStatusSegment iconOnly={false} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByLabelText('Translate text'))
    await waitFor(() => expect(getAiApiKeyStatusMock).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    await waitFor(() => expect(getAiApiKeyStatusMock).toHaveBeenCalledTimes(2))
    expect(
      screen.getByText(/Add an AI translation API key in Settings to use AI mode/)
    ).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Type or paste text/), {
      target: { value: 'dependent' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(translateWithAiMock).not.toHaveBeenCalled()
  })

  it('opens Appearance AI translation settings from the inline reminder', async () => {
    getAiApiKeyStatusMock.mockResolvedValue({ configured: false })
    render(
      <TooltipProvider>
        <TranslateStatusSegment iconOnly={false} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByLabelText('Translate text'))
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    await waitFor(() =>
      expect(
        screen.getByText(/Add an AI translation API key in Settings to use AI mode/)
      ).toBeTruthy()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go to settings' }))
    expect(storeState.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'appearance',
      repoId: null,
      sectionId: 'translate-ai'
    })
    expect(storeState.openSettingsPage).toHaveBeenCalledOnce()
  })
})
