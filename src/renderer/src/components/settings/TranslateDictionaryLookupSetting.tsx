import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { getTranslateDictionaryEntry } from './appearance-translate-dictionary-search'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitchRow } from './SettingsFormControls'

type TranslateDictionaryLookupSettingProps = {
  settings: Pick<GlobalSettings, 'translateDictionaryLookupEnabled'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function TranslateDictionaryLookupSetting({
  settings,
  updateSettings
}: TranslateDictionaryLookupSettingProps): React.JSX.Element {
  const entry = getTranslateDictionaryEntry()
  const enabled = settings.translateDictionaryLookupEnabled ?? true

  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
    >
      <SettingsSwitchRow
        label={entry.title}
        description={entry.description}
        checked={enabled}
        onChange={() => updateSettings({ translateDictionaryLookupEnabled: !enabled })}
        ariaLabel={entry.title}
      />
    </SearchableSetting>
  )
}
