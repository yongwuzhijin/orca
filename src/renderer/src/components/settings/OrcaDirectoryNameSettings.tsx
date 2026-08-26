import React, { useEffect, useId, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  DEFAULT_ORCA_DIR_NAME,
  sanitizeHomeOrcaDirName,
  sanitizeWorkspaceOrcaDirName
} from '../../../../shared/orca-dir-names'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { useEffectiveOrcaHomeDirName } from '@/hooks/useEffectiveOrcaHomeDirName'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import { translate } from '@/i18n/i18n'

type OrcaDirectoryNameSettingsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

type DirectoryNameFieldProps = {
  label: string
  resetLabel: string
  value: string
  sanitize: (raw: string) => string | null
  invalidMessage: string
  helpText: string
  onCommit: (next: string) => void
}

function DirectoryNameField({
  label,
  resetLabel,
  value,
  sanitize,
  invalidMessage,
  helpText,
  onCommit
}: DirectoryNameFieldProps): React.JSX.Element {
  const inputId = useId()
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const skipNextBlurCommitRef = useRef(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setDraft(value)
    draftRef.current = value
    setInvalid(false)
  }, [value])

  const write = (next: string): void => {
    draftRef.current = next
    setDraft(next)
    setInvalid(false)
  }

  // Why validate before writing: main falls back to the default for a bad value, so an
  // unvalidated save would silently do nothing and look like a lost edit.
  const commit = (): void => {
    const next = draftRef.current
    if (next === value) {
      setInvalid(false)
      return
    }
    const sanitized = sanitize(next)
    if (sanitized === null) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onCommit(sanitized)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          aria-invalid={invalid}
          onChange={(e) => {
            write(e.target.value)
          }}
          onBlur={() => {
            if (skipNextBlurCommitRef.current) {
              skipNextBlurCommitRef.current = false
              return
            }
            commit()
          }}
          onKeyDown={(e) => {
            if (isImeCompositionKeyDown(e)) {
              return
            }
            if (e.key === 'Enter') {
              skipNextBlurCommitRef.current = true
              commit()
              e.currentTarget.blur()
              return
            }
            if (e.key === 'Escape') {
              skipNextBlurCommitRef.current = true
              write(value)
              e.currentTarget.blur()
            }
          }}
          className="flex-1 text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={resetLabel}
          className="h-9 shrink-0 gap-1.5 text-xs"
          onPointerDown={() => {
            skipNextBlurCommitRef.current = true
          }}
          onClick={() => {
            write(DEFAULT_ORCA_DIR_NAME)
            if (value !== DEFAULT_ORCA_DIR_NAME) {
              onCommit(DEFAULT_ORCA_DIR_NAME)
            }
          }}
        >
          <RotateCcw className="size-3.5" />
          {resetLabel}
        </Button>
      </div>
      {invalid ? (
        <p role="alert" className="text-xs text-destructive">
          {invalidMessage}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
    </div>
  )
}

export function OrcaDirectoryNameSettings({
  settings,
  updateSettings
}: OrcaDirectoryNameSettingsProps): React.JSX.Element {
  const effectiveHomeDirName = useEffectiveOrcaHomeDirName()
  const pendingHomeDirName = settings.homeOrcaDirName ?? DEFAULT_ORCA_DIR_NAME
  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.OrcaDirectoryNameSettings.title',
        'Orca Directory Names'
      )}
      description={translate(
        'auto.components.settings.OrcaDirectoryNameSettings.description',
        'Names of the directories Orca uses for its own state inside each workspace and under your home directory.'
      )}
      keywords={['orca dir', 'temp folder', 'scratch', 'drops', 'templates', 'keybindings']}
      className="space-y-4"
    >
      <DirectoryNameField
        label={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.workspaceLabel',
          'Workspace Orca directory'
        )}
        resetLabel={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.resetWorkspace',
          'Reset workspace name'
        )}
        value={settings.workspaceOrcaDirName ?? DEFAULT_ORCA_DIR_NAME}
        sanitize={sanitizeWorkspaceOrcaDirName}
        invalidMessage={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.workspaceInvalid',
          'Enter a relative directory name inside the workspace. No absolute paths, "..", or special characters.'
        )}
        helpText={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.workspaceHelp',
          'Holds dropped files, document templates, design docs, and the issue-command override. Applies immediately.'
        )}
        onCommit={(next) => updateSettings({ workspaceOrcaDirName: next })}
      />
      <DirectoryNameField
        label={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.homeLabel',
          'Home Orca directory'
        )}
        resetLabel={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.resetHome',
          'Reset home name'
        )}
        value={settings.homeOrcaDirName ?? DEFAULT_ORCA_DIR_NAME}
        sanitize={sanitizeHomeOrcaDirName}
        invalidMessage={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.homeInvalid',
          'Enter a single directory name under your home directory. No separators or special characters.'
        )}
        helpText={translate(
          'auto.components.settings.OrcaDirectoryNameSettings.homeHelp',
          'Holds credentials, keybindings, and agent hook scripts. Takes effect after a restart; existing files are not moved.'
        )}
        onCommit={(next) => updateSettings({ homeOrcaDirName: next })}
      />
      {pendingHomeDirName !== effectiveHomeDirName && (
        <p role="status" className="text-xs text-amber-600 dark:text-amber-500">
          {translate(
            'auto.components.settings.OrcaDirectoryNameSettings.restartPending',
            'Restart Orca to use ~/{{pending}}. This session is still using ~/{{effective}}.',
            { pending: pendingHomeDirName, effective: effectiveHomeDirName }
          )}
        </p>
      )}
    </SearchableSetting>
  )
}
