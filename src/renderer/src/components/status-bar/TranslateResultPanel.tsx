import React, { useCallback, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { DEFAULT_TRANSLATE_AI_MODEL } from '../../../../shared/translate-ai-defaults'
import type { DictionaryHeadwordEntry } from '../../../../shared/text-translation-types'
import type { TranslateResult } from './translate-popover-state'
import { describeTranslationPartOfSpeech } from './translation-part-of-speech'

type TranslateResultPanelProps = {
  result: TranslateResult
  /** What the user typed, so a normalized query can be called out. */
  typedText: string
  /** Youdao headwords; empty when the lookup was skipped, missed, or failed. */
  headwordEntries: DictionaryHeadwordEntry[]
}

export function TranslateResultPanel({
  result,
  typedText,
  headwordEntries
}: TranslateResultPanelProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    void window.api.ui.writeClipboardText(result.translatedText).then(() => setCopied(true))
  }, [result.translatedText])

  const notes: string[] = []
  if (
    typeof result.queriedText === 'string' &&
    result.queriedText !== '' &&
    result.queriedText !== typedText.trim()
  ) {
    notes.push(
      // A function replacer: a typed `$&` would otherwise be expanded by String.replace.
      translate('statusBar.translate.normalizedNote', 'Looked up as “{query}”').replace(
        '{query}',
        () => result.queriedText
      )
    )
  }
  const provider = describeProvider(result)
  if (provider !== '') {
    notes.push(provider)
  }
  // Youdao wins over the gtx block; `?? []` guards an IPC payload from a main bundle that predates the field.
  const posEntries = headwordEntries.length > 0 ? [] : (result.dictionaryEntries ?? [])

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-muted/40 p-2">
      <p className="scrollbar-sleek max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] text-foreground select-text">
        {result.translatedText}
      </p>

      {headwordEntries.length > 0 && (
        <dl
          aria-label={translate('statusBar.translate.dictionaryAriaLabel', 'Dictionary entries')}
          className="scrollbar-sleek m-0 flex max-h-40 flex-col gap-1 overflow-y-auto border-t border-border pt-1.5"
        >
          {headwordEntries.map((entry) => (
            <div key={entry.headword} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-medium text-muted-foreground">{entry.headword}</dt>
              <dd className="m-0 text-[12px] text-foreground select-text">{entry.explain}</dd>
            </div>
          ))}
        </dl>
      )}

      {posEntries.length > 0 && (
        <dl className="scrollbar-sleek m-0 flex max-h-40 flex-col gap-1 overflow-y-auto border-t border-border pt-1.5">
          {posEntries.map((entry) => (
            <div key={entry.partOfSpeech} className="flex items-baseline gap-1.5">
              <dt className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground italic">
                {describeTranslationPartOfSpeech(entry.partOfSpeech)}
              </dt>
              <dd className="m-0 text-[12px] text-foreground select-text">
                {entry.terms.join('，')}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">
          {notes.join(' · ')}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/70"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied
            ? translate('statusBar.translate.copied', 'Copied')
            : translate('statusBar.translate.copy', 'Copy')}
        </button>
      </div>
    </div>
  )
}

function describeProvider(result: TranslateResult): string {
  if (result.providerId === 'ai') {
    return translate('statusBar.translate.modelNote', 'Translated by {model}').replace(
      '{model}',
      result.agentLabel ?? DEFAULT_TRANSLATE_AI_MODEL
    )
  }
  if (result.providerId === 'google-gtx') {
    return ''
  }
  return translate('statusBar.translate.fallbackNote', 'Translated by the backup service')
}
