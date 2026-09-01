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
    render(<TranslateResultPanel result={GTX} typedText="dependent" headwordEntries={[]} />)
    expect(screen.getByText('adj.')).toBeTruthy()
    expect(screen.getByText('属，依赖的')).toBeTruthy()
    expect(screen.getByText('n.')).toBeTruthy()
    expect(screen.getByText('依赖他人者')).toBeTruthy()
  })

  it('calls out the normalized query so a shouted word does not look mistranslated', () => {
    render(<TranslateResultPanel result={GTX} typedText="DEPENDENT" headwordEntries={[]} />)
    expect(screen.getByText(/dependent/)).toBeTruthy()
  })

  it('stays silent about the provider when the primary one answered', () => {
    const { container } = render(
      <TranslateResultPanel result={GTX} typedText="dependent" headwordEntries={[]} />
    )
    expect(container.textContent).not.toContain('backup')
  })

  it('names the model that produced an AI translation', () => {
    render(
      <TranslateResultPanel
        result={{
          translatedText: 'adj. 依赖的',
          dictionaryEntries: [],
          queriedText: 'dependent',
          providerId: 'ai',
          agentLabel: 'qwen-mt-flash'
        }}
        typedText="dependent"
        headwordEntries={[]}
      />
    )
    expect(screen.getByText(/qwen-mt-flash/)).toBeTruthy()
  })

  it('falls back to the default model name when the payload omits agentLabel', () => {
    render(
      <TranslateResultPanel
        result={{
          translatedText: 'adj. 依赖的',
          dictionaryEntries: [],
          queriedText: 'dependent',
          providerId: 'ai'
        }}
        typedText="dependent"
        headwordEntries={[]}
      />
    )
    expect(screen.getByText(/qwen-mt-flash/)).toBeTruthy()
    expect(screen.queryByText(/AI agent/)).toBeNull()
  })

  it('still renders the translation when the payload omits the dictionary array', () => {
    // A stale main bundle predates the field; undefined used to crash the whole status bar.
    const { dictionaryEntries: _dropped, ...withoutDictionary } = GTX
    render(
      <TranslateResultPanel
        result={withoutDictionary as TranslateResult}
        typedText="dependent"
        headwordEntries={[]}
      />
    )
    expect(screen.getByText('家属')).toBeTruthy()
    expect(screen.queryByText('adj.')).toBeNull()
  })

  it('marks a fallback-provider result so a worse gloss is explained', () => {
    render(
      <TranslateResultPanel
        result={{ ...GTX, dictionaryEntries: [], providerId: 'mymemory' }}
        typedText="dependent"
        headwordEntries={[]}
      />
    )
    expect(screen.getByText(/backup service/)).toBeTruthy()
  })
})

const HEADWORDS = [
  { headword: 'dependent', explain: 'adj. 依赖的，依靠的；取决于 n. 受供养者' },
  { headword: 'dependent variable', explain: '因变量' }
]

describe('TranslateResultPanel dictionary block', () => {
  it('lists each Youdao headword with its gloss', () => {
    render(<TranslateResultPanel result={GTX} typedText="dependent" headwordEntries={HEADWORDS} />)
    expect(screen.getByLabelText('Dictionary entries')).toBeTruthy()
    expect(screen.getByText('dependent')).toBeTruthy()
    expect(screen.getByText('adj. 依赖的，依靠的；取决于 n. 受供养者')).toBeTruthy()
    expect(screen.getByText('dependent variable')).toBeTruthy()
    expect(screen.getByText('因变量')).toBeTruthy()
  })

  it('suppresses the gtx part-of-speech block so only one dictionary shows', () => {
    // Why: gtx synonyms and Youdao headwords are both dictionaries; stacked they read as duplicates.
    render(<TranslateResultPanel result={GTX} typedText="dependent" headwordEntries={HEADWORDS} />)
    expect(screen.queryByText('adj.')).toBeNull()
    expect(screen.queryByText('属，依赖的')).toBeNull()
  })

  it('falls back to the gtx block when Youdao returned nothing', () => {
    render(<TranslateResultPanel result={GTX} typedText="dependent" headwordEntries={[]} />)
    expect(screen.getByText('adj.')).toBeTruthy()
    expect(screen.getByText('属，依赖的')).toBeTruthy()
  })

  it('prints a query containing $& literally rather than expanding it', () => {
    render(
      <TranslateResultPanel
        result={{ ...GTX, queriedText: 'a$&b' }}
        typedText="A$&B"
        headwordEntries={[]}
      />
    )
    expect(screen.getByText(/a\$&b/)).toBeTruthy()
  })

  it('renders no normalized note when queriedText was normalized away to empty', () => {
    const { container } = render(
      <TranslateResultPanel
        result={{ ...GTX, queriedText: '' }}
        typedText="dependent"
        headwordEntries={[]}
      />
    )
    expect(container.textContent).not.toContain('undefined')
    expect(container.textContent).not.toContain('Looked up as')
  })

  it('renders no normalized note when the payload omitted queriedText entirely', () => {
    // Regression: the note used to interpolate undefined and print “Looked up as “undefined””.
    const { container } = render(
      <TranslateResultPanel
        result={{ ...GTX, queriedText: undefined as unknown as string }}
        typedText="dependent"
        headwordEntries={[]}
      />
    )
    expect(container.textContent).not.toContain('undefined')
    expect(container.textContent).not.toContain('Looked up as')
  })
})
