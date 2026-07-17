import type React from 'react'
import type { GlobalSettings } from '../../../../shared/types'
import { DEFAULT_TODO_ORCHESTRATOR_CONFIG } from '../../../../shared/todo/todo-orchestrator-config'
import { translate } from '@/i18n/i18n'
import { NumberField, SettingsSwitchRow } from './SettingsFormControls'

type TodoOrchestratorSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function TodoOrchestratorSetting({
  settings,
  updateSettings
}: TodoOrchestratorSettingProps): React.JSX.Element {
  const config = settings.todoOrchestrator ?? DEFAULT_TODO_ORCHESTRATOR_CONFIG
  return (
    <section className="space-y-3">
      <SettingsSwitchRow
        label={translate('auto.settings.todoOrchestrator.enable', 'Autonomous task orchestrator')}
        description={translate(
          'auto.settings.todoOrchestrator.enableDescription',
          'Automatically pick up AutoPilot-eligible tasks and dispatch them to idle slots.'
        )}
        checked={config.enabled}
        onChange={() =>
          void updateSettings({
            todoOrchestrator: { ...config, enabled: !config.enabled }
          })
        }
      />
      {config.enabled ? (
        <NumberField
          label={translate('auto.settings.todoOrchestrator.maxConcurrent', 'Max concurrent tasks')}
          description={translate(
            'auto.settings.todoOrchestrator.maxConcurrentDescription',
            'Upper bound on tasks the orchestrator runs at once.'
          )}
          value={config.maxConcurrent}
          defaultValue={DEFAULT_TODO_ORCHESTRATOR_CONFIG.maxConcurrent}
          min={1}
          max={10}
          onChange={(next) =>
            void updateSettings({
              todoOrchestrator: { ...config, maxConcurrent: Math.max(1, Math.floor(next)) }
            })
          }
        />
      ) : null}
    </section>
  )
}
