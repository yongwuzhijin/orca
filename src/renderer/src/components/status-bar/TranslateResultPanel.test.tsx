// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TranslateResult } from './translate-popover-state'
import { TranslateResultPanel } from './TranslateResultPanel'

const GTX: TranslateResult = {
  translatedText: '家属',
  dictionaryEntries: [
    { partOfSpeech: 'adjective', terms: ['属', '依赖的'] },
    { partOfSpeech: 'noun', terms: ['依赖他人者'] }
  ],
  queriedText: 'dependent',
  providerId: 'google-gtx'
}

afterEach(cleanup)

describe('TranslateResultPanel', () => {
  it('renders one abbreviated row per part of speech with its senses', () => {
    render(<TranslateResultPanel result={GTX} typedText="dependent" />)
    expect(screen.getByText('adj.')).toBeTruthy()
    expect(screen.getByText('属，依赖的')).toBeTruthy()
    expect(screen.getByText('n.')).toBeTruthy()
    expect(screen.getByText('依赖他人者')).toBeTruthy()
  })

  it('calls out the normalized query so a shouted word does not look mistranslated', () => {
    render(<TranslateResultPanel result={GTX} typedText="DEPENDENT" />)
    expect(screen.getByText(/dependent/)).toBeTruthy()
  })

  it('stays silent about the provider when the primary one answered', () => {
    const { container } = render(<TranslateResultPanel result={GTX} typedText="dependent" />)
    expect(container.textContent).not.toContain('backup')
  })

  it('names the agent that produced an AI translation', () => {
    render(
      <TranslateResultPanel
        result={{
          translatedText: 'adj. 依赖的',
          dictionaryEntries: [],
          queriedText: 'dependent',
          providerId: 'ai',
          agentLabel: 'Claude'
        }}
        typedText="dependent"
      />
    )
    expect(screen.getByText(/Claude/)).toBeTruthy()
  })

  it('still renders the translation when the payload omits the dictionary array', () => {
    // A stale main bundle predates the field; undefined used to crash the whole status bar.
    const { dictionaryEntries: _dropped, ...withoutDictionary } = GTX
    render(
      <TranslateResultPanel result={withoutDictionary as TranslateResult} typedText="dependent" />
    )
    expect(screen.getByText('家属')).toBeTruthy()
    expect(screen.queryByText('adj.')).toBeNull()
  })

  it('marks a fallback-provider result so a worse gloss is explained', () => {
    render(
      <TranslateResultPanel
        result={{ ...GTX, dictionaryEntries: [], providerId: 'mymemory' }}
        typedText="dependent"
      />
    )
    expect(screen.getByText(/backup service/)).toBeTruthy()
  })
})
