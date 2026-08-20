// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TranslateStatusSegment } from './TranslateStatusSegment'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { recordFeatureInteraction: () => void }) => unknown) =>
    selector({ recordFeatureInteraction: () => {} })
}))

const translateMock = vi.fn()
const translateWithAiMock = vi.fn()
const lookupDictionaryMock = vi.fn()

beforeEach(() => {
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
        lookupDictionary: lookupDictionaryMock
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

  it('drops a stale lookup so an earlier word cannot label a newer result', async () => {
    openAndSubmit('dependent')
    await waitFor(() => expect(screen.getByText('adj. 依赖的')).toBeTruthy())
    lookupDictionaryMock.mockResolvedValue({ entries: [] })
    fireEvent.change(screen.getByPlaceholderText(/Type or paste text/), {
      target: { value: 'cold' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))
    await waitFor(() => expect(screen.queryByText('adj. 依赖的')).toBeNull())
  })
})
