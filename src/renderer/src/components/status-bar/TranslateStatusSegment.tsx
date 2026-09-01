import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Languages, LoaderCircle, Sparkles, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type DictionaryHeadwordEntry,
  type TranslationDirectionPreference
} from '../../../../shared/text-translation-types'
import { resolveTranslationTargetLanguage } from '../../../../shared/translation-target-language'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'
import {
  canSubmitTranslation,
  describeTranslationDirection,
  isTranslationInputTooLong,
  nextTranslationPreference,
  shouldLookUpDictionary,
  toTranslateResult,
  type TranslatePopoverStatus
} from './translate-popover-state'
import { TRANSLATE_AI_SETTING_ID } from '@/components/settings/appearance-translate-ai-search'
import { TranslateResultPanel } from './TranslateResultPanel'
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
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const dictionaryEnabled = useAppStore((s) => s.settings?.translateDictionaryLookupEnabled ?? true)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [preference, setPreference] = useState<TranslationDirectionPreference>('auto')
  const [useAi, setUseAi] = useState(false)
  const [aiApiKeyConfigured, setAiApiKeyConfigured] = useState<boolean | null>(null)
  const [status, setStatus] = useState<TranslatePopoverStatus>({ phase: 'idle' })
  const [headwordEntries, setHeadwordEntries] = useState<DictionaryHeadwordEntry[]>([])
  // Late responses from a superseded submit must not overwrite a newer result.
  const submitSeqRef = useRef(0)

  const direction = useMemo(
    () =>
      describeTranslationDirection(resolveTranslationTargetLanguage(text, preference), preference),
    [text, preference]
  )
  const canSubmit = canSubmitTranslation(text, status)

  const refreshAiApiKeyStatus = useCallback(() => {
    void window.api.translation.getAiApiKeyStatus().then((status) => {
      setAiApiKeyConfigured(status.configured)
    })
  }, [])

  const openTranslateAiSettings = useCallback(() => {
    openSettingsTarget({
      pane: 'appearance',
      repoId: null,
      sectionId: TRANSLATE_AI_SETTING_ID
    })
    openSettingsPage()
  }, [openSettingsPage, openSettingsTarget])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        recordFeatureInteraction('translate')
        refreshAiApiKeyStatus()
      }
    },
    [recordFeatureInteraction, refreshAiApiKeyStatus]
  )

  const handleAiToggle = useCallback(() => {
    const nextUseAi = !useAi
    setUseAi(nextUseAi)
    if (nextUseAi) {
      refreshAiApiKeyStatus()
    }
  }, [refreshAiApiKeyStatus, useAi])

  const submit = useCallback(
    (withAi: boolean) => {
      const trimmed = text.trim()
      if (trimmed === '' || isTranslationInputTooLong(text)) {
        return
      }
      if (withAi && aiApiKeyConfigured === false) {
        return
      }
      const seq = submitSeqRef.current + 1
      submitSeqRef.current = seq
      setStatus({ phase: 'translating', usedAi: withAi })
      setHeadwordEntries([])
      if (shouldLookUpDictionary(text, withAi, dictionaryEnabled)) {
        void window.api.translation
          .lookupDictionary({ text: trimmed })
          .then((response) => {
            // The same sequence guard as the translation: a superseded lookup is discarded.
            if (submitSeqRef.current === seq) {
              setHeadwordEntries(Array.isArray(response.entries) ? response.entries : [])
            }
          })
          .catch(() => {})
      }
      const api = window.api.translation
      const pending = withAi
        ? api.translateWithAi({ text, preference })
        : api.translate({ text, preference })
      void pending
        .then((response) => {
          if (submitSeqRef.current !== seq) {
            return
          }
          setStatus(
            response.ok
              ? { phase: 'success', result: toTranslateResult(response) }
              : { phase: 'error', kind: response.kind, detail: response.detail }
          )
        })
        .catch(() => {
          if (submitSeqRef.current === seq) {
            setStatus({ phase: 'error', kind: withAi ? 'ai-unavailable' : 'provider-error' })
          }
        })
    },
    [aiApiKeyConfigured, dictionaryEnabled, preference, text]
  )

  const handleSubmit = useCallback(() => {
    if (useAi && aiApiKeyConfigured === false) {
      return
    }
    if (canSubmit) {
      submit(useAi)
    }
  }, [aiApiKeyConfigured, canSubmit, submit, useAi])

  // Abandons the in-flight sequence too, so a racing late reply cannot revive it.
  const handleCancelAi = useCallback(() => {
    submitSeqRef.current += 1
    setStatus({ phase: 'idle' })
    void window.api.translation.cancelAi()
  }, [])

  const tooLong = isTranslationInputTooLong(text)
  const cancellable = status.phase === 'translating' && status.usedAi
  const showAiNotConfigured = useAi && aiApiKeyConfigured === false

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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleAiToggle}
              aria-pressed={useAi}
              className={
                useAi
                  ? 'inline-flex items-center gap-1 rounded border border-primary/60 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-foreground'
                  : 'inline-flex items-center gap-1 rounded border border-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/70'
              }
              title={translate(
                'statusBar.translate.aiHint',
                'Use your configured OpenAI-compatible API instead of the free service'
              )}
            >
              <Sparkles className="size-3" />
              {translate('statusBar.translate.ai', 'AI')}
            </button>
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
          {showAiNotConfigured && (
            <div className="flex flex-col items-start gap-1">
              <p className="text-[11px] text-muted-foreground">
                {translate(
                  'statusBar.translate.aiNotConfigured',
                  'Add an AI translation API key in Settings to use AI mode.'
                )}
              </p>
              <button
                type="button"
                onClick={openTranslateAiSettings}
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent/70"
              >
                {translate('statusBar.translate.goToSettings', 'Go to settings')}
              </button>
            </div>
          )}
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
            <div className="flex items-center gap-1.5">
              {cancellable && (
                <button
                  type="button"
                  onClick={handleCancelAi}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent/70"
                >
                  <X className="size-3" />
                  {translate('statusBar.translate.cancel', 'Cancel')}
                </button>
              )}
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
          </div>

          {status.phase === 'error' && (
            <div className="flex flex-col items-start gap-1">
              <p className="text-[11px] text-destructive">
                {describeTranslationFailure(status.kind)}
              </p>
              {status.detail !== undefined && (
                <p className="scrollbar-sleek max-h-20 overflow-y-auto text-[11px] whitespace-pre-wrap text-muted-foreground select-text">
                  {status.detail}
                </p>
              )}
              {status.kind === 'ai-unavailable' && (
                <button
                  type="button"
                  onClick={() => submit(false)}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-foreground hover:bg-accent/70"
                >
                  {translate('statusBar.translate.useFreeInstead', 'Use the quick translation')}
                </button>
              )}
            </div>
          )}

          {status.phase === 'success' && (
            // Remounting on a new result clears the panel's copied state.
            <TranslateResultPanel
              key={status.result.translatedText}
              result={status.result}
              typedText={text}
              headwordEntries={headwordEntries}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
