import type React from 'react'
import { DEFAULT_TODO_DESIGN_STAGE_SKILL } from '../../../../shared/constants'
import { Input } from '../ui/input'
import { translate } from '@/i18n/i18n'
import { SettingsRow } from './SettingsFormControls'

type TodoDesignStageSkillSettingProps = {
  value: string
  onChange: (next: string) => void
}

// Free text on purpose: the value is only a prompt prefix, so Orca must not gate it on skills it can enumerate.
export function TodoDesignStageSkillSetting({
  value,
  onChange
}: TodoDesignStageSkillSettingProps): React.JSX.Element {
  return (
    <SettingsRow
      labelId="todo-design-stage-skill-label"
      label={translate(
        'auto.components.settings.todoDesignStageSkill.label',
        'Solution design skill'
      )}
      description={translate(
        'auto.components.settings.todoDesignStageSkill.description',
        'Prepended to the prompt when a task enters the solution design stage. Leave empty to disable the stage.'
      )}
      control={
        <Input
          aria-labelledby="todo-design-stage-skill-label"
          className="w-64 font-mono text-xs"
          value={value}
          placeholder={DEFAULT_TODO_DESIGN_STAGE_SKILL}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
        />
      }
    />
  )
}
