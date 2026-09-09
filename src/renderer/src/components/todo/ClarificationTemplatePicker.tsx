import React from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { openRequirementSettings } from './open-requirement-settings'

type ClarificationTemplatePickerProps = {
  value: string | null
  onSelect: (templateId: string | null) => void
}

export function ClarificationTemplatePicker({
  value,
  onSelect
}: ClarificationTemplatePickerProps): React.JSX.Element {
  const templates = useAppStore((s) => s.todoClarificationTemplates)
  const loadTodoClarificationTemplates = useAppStore((s) => s.loadTodoClarificationTemplates)

  React.useEffect(() => {
    void loadTodoClarificationTemplates()
  }, [loadTodoClarificationTemplates])

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value ?? '__none__'}
        onValueChange={(next) => onSelect(next === '__none__' ? null : next)}
      >
        <SelectTrigger className="h-9 w-full flex-1">
          <SelectValue
            placeholder={translate(
              'auto.components.todo.ClarificationTemplatePicker.placeholder',
              'Select clarification template'
            )}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">
            {translate('auto.components.todo.ClarificationTemplatePicker.none', 'No template')}
          </SelectItem>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={translate(
          'auto.components.todo.ClarificationTemplatePicker.openRequirementSettings',
          'Open clarification template settings'
        )}
        onClick={() => openRequirementSettings('clarification')}
      >
        <Settings2 className="size-4" />
      </Button>
    </div>
  )
}
