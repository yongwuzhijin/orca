import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Check, Copy, Languages, LoaderCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationDirectionPreference
} from '../../../../shared/text-translation-types'
import { resolveTranslationTargetLanguage } from '../../../../shared/translation-target-language'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'
import {
  canSubmitTranslation,
  describeTranslationDirection,
  isTranslationInputTooLong,
  nextTranslationPreference,
  type TranslatePopoverStatus
} from './translate-popover-state'
import { describeTranslationFailure } from './translation-failure-message'

type TranslateStatusSegmentProps = {
  iconOnly: boolean
}

function languageLabel(language: 'zh-CN' | 'en'): string {
  return language === 'en'
    ? translate('statusBar.translate.language.en', 'EN')
    : translate('statusBar.translate.language.zh', '中')
}

export function TranslateStatusSegment({
  iconOnly
}: TranslateStatusSegmentProps): React.JSX.Element {
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [preference, setPreference] = useState<TranslationDirectionPreference>('auto')
  const [status, setStatus] = useState<TranslatePopoverStatus>({ phase: 'idle' })
  const [copied, setCopied] = useState(false)
  // Late responses from a superseded submit must not overwrite a newer result.
  const submitSeqRef = useRef(0)

  const direction = useMemo(
    () =>
      describeTranslationDirection(resolveTranslationTargetLanguage(text, preference), preference),
    [text, preference]
  )
  const canSubmit = canSubmitTranslation(text, status)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        recordFeatureInteraction('translate')
      }
    },
    [recordFeatureInteraction]
  )

  const handleSubmit = useCallback(() => {
    if (!canSubmit) {
      return
    }
    const seq = submitSeqRef.current + 1
    submitSeqRef.current = seq
    setStatus({ phase: 'translating' })
    setCopied(false)
    void window.api.translation
      .translate({ text, preference })
      .then((response) => {
        if (submitSeqRef.current !== seq) {
          return
        }
        setStatus(
          response.ok
            ? {
                phase: 'success',
                translatedText: response.translatedText,
                usedFallbackProvider: response.providerId !== 'google-gtx'
              }
            : { phase: 'error', kind: response.kind }
        )
      })
      .catch(() => {
        if (submitSeqRef.current === seq) {
          setStatus({ phase: 'error', kind: 'provider-error' })
        }
      })
  }, [canSubmit, preference, text])

  const handleCopy = useCallback(() => {
    if (status.phase !== 'success') {
      return
    }
    void window.api.ui.writeClipboardText(status.translatedText).then(() => setCopied(true))
  }, [status])

  const tooLong = isTranslationInputTooLong(text)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/70"
              aria-label={translate('statusBar.translate.ariaLabel', 'Translate text')}
            >
              <Languages className="size-3 text-muted-foreground" />
              {!iconOnly && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {translate('statusBar.translate.label', 'Translate')}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {translate('statusBar.translate.tooltip', 'Translate between Chinese and English')}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-[26rem] max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
            <Languages className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{translate('statusBar.translate.title', 'Translate')}</span>
          </div>
          <button
            type="button"
            onClick={() => setPreference(nextTranslationPreference(preference))}
            className={
              direction.forced
                ? 'rounded border border-primary/60 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground'
                : 'rounded border border-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/70'
            }
            title={translate(
              'statusBar.translate.directionHint',
              'Click to switch direction; Auto detects it from your text'
            )}
          >
            {`${languageLabel(direction.source)} → ${languageLabel(direction.target)}`}
            {!direction.forced && ` · ${translate('statusBar.translate.auto', 'Auto')}`}
          </button>
        </div>

        <div className="flex flex-col gap-2 p-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={translate(
              'statusBar.translate.placeholder',
              'Type or paste text, then press Enter'
            )}
            className="min-h-20 max-h-40 resize-none text-[13px]"
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={
                tooLong
                  ? 'text-[11px] tabular-nums text-destructive'
                  : 'text-[11px] tabular-nums text-muted-foreground'
              }
            >
              {`${text.trim().length} / ${TRANSLATION_INPUT_MAX_LENGTH}`}
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {status.phase === 'translating' && <LoaderCircle className="size-3 animate-spin" />}
              {translate('statusBar.translate.submit', 'Translate')}
            </button>
          </div>

          {status.phase === 'error' && (
            <p className="text-[11px] text-destructive">
              {describeTranslationFailure(status.kind)}
            </p>
          )}

          {status.phase === 'success' && (
            <div className="flex flex-col gap-1.5 rounded border border-border bg-muted/40 p-2">
              <p className="scrollbar-sleek max-h-40 overflow-y-auto whitespace-pre-wrap text-[13px] text-foreground select-text">
                {status.translatedText}
              </p>
              <div className="flex items-center justify-between gap-2">
                {status.usedFallbackProvider ? (
                  <span className="text-[11px] text-muted-foreground">
                    {translate(
                      'statusBar.translate.fallbackNote',
                      'Translated by the backup service'
                    )}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/70"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied
                    ? translate('statusBar.translate.copied', 'Copied')
                    : translate('statusBar.translate.copy', 'Copy')}
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
