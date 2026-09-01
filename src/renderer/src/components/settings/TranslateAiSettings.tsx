import type React from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { CheckCircle2, Cloud, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  resolveTranslateAiBaseUrl,
  resolveTranslateAiModel
} from '../../../../shared/translate-ai-defaults'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { getTranslateAiEntry, TRANSLATE_AI_SETTING_ID } from './appearance-translate-ai-search'
import { SearchableSetting } from './SearchableSetting'
import { TranslateAiApiKeyDialog } from './TranslateAiApiKeyDialog'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { translate } from '@/i18n/i18n'

type TranslateAiSettingsProps = {
  settings: Pick<GlobalSettings, 'translateAiBaseUrl' | 'translateAiModel'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

type SettingsTextFieldProps = {
  label: string
  value: string
  onCommit: (next: string) => void
}

function SettingsTextField({ label, value, onCommit }: SettingsTextFieldProps): React.JSX.Element {
  const inputId = useId()
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const skipNextBlurCommitRef = useRef(false)

  useEffect(() => {
    setDraft(value)
    draftRef.current = value
  }, [value])

  const write = (next: string): void => {
    draftRef.current = next
    setDraft(next)
  }

  const commit = (): void => {
    const next = draftRef.current.trim()
    if (next === value) {
      return
    }
    onCommit(next)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        value={draft}
        onChange={(event) => {
          write(event.target.value)
        }}
        onBlur={() => {
          if (skipNextBlurCommitRef.current) {
            skipNextBlurCommitRef.current = false
            return
          }
          commit()
        }}
        onKeyDown={(event) => {
          if (isImeCompositionKeyDown(event)) {
            return
          }
          if (event.key === 'Enter') {
            skipNextBlurCommitRef.current = true
            commit()
            event.currentTarget.blur()
            return
          }
          if (event.key === 'Escape') {
            skipNextBlurCommitRef.current = true
            write(value)
            event.currentTarget.blur()
          }
        }}
        className="text-xs"
      />
    </div>
  )
}

export function TranslateAiSettings({
  settings,
  updateSettings
}: TranslateAiSettingsProps): React.JSX.Element {
  const entry = getTranslateAiEntry()
  const resolvedBaseUrl = resolveTranslateAiBaseUrl(settings.translateAiBaseUrl)
  const resolvedModel = resolveTranslateAiModel(settings.translateAiModel)
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [apiKeyPending, setApiKeyPending] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    void window.api.translation.getAiApiKeyStatus().then((status) => {
      if (mountedRef.current) {
        setApiKeyConfigured(status.configured)
      }
    })
    return () => {
      mountedRef.current = false
    }
  }, [])

  const openDialog = (): void => {
    setApiKeyDraft('')
    setDialogOpen(true)
  }

  const saveApiKey = async (): Promise<void> => {
    setApiKeyPending(true)
    try {
      await window.api.translation.saveAiApiKey(apiKeyDraft)
      if (mountedRef.current) {
        setApiKeyConfigured(true)
        setDialogOpen(false)
        setApiKeyDraft('')
      }
      toast.success(
        translate('auto.components.settings.TranslateAiSettings.apiKeySaved', 'API key saved')
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.settings.TranslateAiSettings.apiKeySaveFailed',
              'Failed to save API key'
            )
      )
    } finally {
      if (mountedRef.current) {
        setApiKeyPending(false)
      }
    }
  }

  const clearApiKey = async (): Promise<void> => {
    setApiKeyPending(true)
    try {
      await window.api.translation.clearAiApiKey()
      if (mountedRef.current) {
        setApiKeyConfigured(false)
        setDialogOpen(false)
        setApiKeyDraft('')
      }
      toast.success(
        translate('auto.components.settings.TranslateAiSettings.apiKeyCleared', 'API key cleared')
      )
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : translate(
              'auto.components.settings.TranslateAiSettings.apiKeyClearFailed',
              'Failed to clear API key'
            )
      )
    } finally {
      if (mountedRef.current) {
        setApiKeyPending(false)
      }
    }
  }

  return (
    <SearchableSetting
      id={TRANSLATE_AI_SETTING_ID}
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
    >
      <div className="space-y-3 py-2">
        <SettingsTextField
          label={translate('auto.components.settings.TranslateAiSettings.baseUrlLabel', 'Base URL')}
          value={resolvedBaseUrl}
          onCommit={(next) => updateSettings({ translateAiBaseUrl: next })}
        />
        <SettingsTextField
          label={translate('auto.components.settings.TranslateAiSettings.modelLabel', 'Model')}
          value={resolvedModel}
          onCommit={(next) => updateSettings({ translateAiModel: next })}
        />

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <Cloud className="size-4 shrink-0 text-muted-foreground" />
              <Label>
                {translate('auto.components.settings.TranslateAiSettings.apiKeyLabel', 'API Key')}
              </Label>
              {apiKeyConfigured && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5" />
                  {translate('auto.components.settings.TranslateAiSettings.connected', 'Connected')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {apiKeyConfigured
                ? translate(
                    'auto.components.settings.TranslateAiSettings.apiKeyConfiguredDescription',
                    'API key configured for AI translation.'
                  )
                : translate(
                    'auto.components.settings.TranslateAiSettings.apiKeyMissingDescription',
                    'Add an API key before selecting AI translation.'
                  )}
            </p>
          </div>
          {apiKeyConfigured ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={apiKeyPending} onClick={openDialog}>
                {translate(
                  'auto.components.settings.TranslateAiSettings.replaceKey',
                  'Replace key'
                )}
              </Button>
              <button
                onClick={() => void clearApiKey()}
                aria-label={translate(
                  'auto.components.settings.TranslateAiSettings.disconnectApiKey',
                  'Disconnect API key'
                )}
                disabled={apiKeyPending}
                className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Unlink className="size-3.5" />
              </button>
            </div>
          ) : (
            <Button variant="outline" size="sm" disabled={apiKeyPending} onClick={openDialog}>
              {translate('auto.components.settings.TranslateAiSettings.addApiKey', 'Add API key')}
            </Button>
          )}
        </div>
      </div>

      <TranslateAiApiKeyDialog
        open={dialogOpen}
        configured={apiKeyConfigured}
        apiKeyDraft={apiKeyDraft}
        pending={apiKeyPending}
        onOpenChange={setDialogOpen}
        onApiKeyDraftChange={setApiKeyDraft}
        onSave={() => void saveApiKey()}
        onClear={() => void clearApiKey()}
      />
    </SearchableSetting>
  )
}
