import React from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TodoTemplate } from '../../../../shared/todo/todo-template'
import { TodoTemplateManagerDialog } from './TodoTemplateManagerDialog'

const SELECT_CLASS =
  'h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

type TodoTemplatePickerProps = {
  value: string | null
  onSelect: (template: TodoTemplate | null) => void
}

export function TodoTemplatePicker({
  value,
  onSelect
}: TodoTemplatePickerProps): React.JSX.Element {
  const templates = useAppStore((s) => s.todoTemplates)
  const [managerOpen, setManagerOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2">
      <select
        className={cn(SELECT_CLASS)}
        value={value ?? ''}
        onChange={(e) => {
          const next = templates.find((template) => template.id === e.target.value) ?? null
          onSelect(next)
        }}
      >
        <option value="">
          {translate('auto.components.todo.TodoTemplatePicker.none', 'No template')}
        </option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={translate('auto.components.todo.TodoTemplatePicker.manage', 'Manage templates')}
        onClick={() => setManagerOpen(true)}
      >
        <Settings2 className="size-4" />
      </Button>
      {managerOpen ? <TodoTemplateManagerDialog onClose={() => setManagerOpen(false)} /> : null}
    </div>
  )
}
