import React from 'react'
import { CaseSensitive } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { TodoWorkspaceMultiProjectPicker } from './TodoWorkspaceMultiProjectPicker'

export type TodoCreateWorkspaceFieldsValue = {
  workspaceProjectIds: string[]
  workspaceName: string
}

export function TodoCreateWorkspaceFields({
  value,
  onChange
}: {
  value: TodoCreateWorkspaceFieldsValue
  onChange: (next: TodoCreateWorkspaceFieldsValue) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <TodoWorkspaceMultiProjectPicker
        values={value.workspaceProjectIds}
        onChange={(workspaceProjectIds) => onChange({ ...value, workspaceProjectIds })}
      />

      <div className="space-y-1">
        <label className="block min-w-0 truncate text-xs font-medium text-muted-foreground">
          {translate('auto.components.NewWorkspaceComposerCard.0ee17638fe', 'Workspace name')}{' '}
          <span className="text-muted-foreground/70">
            {translate('auto.components.NewWorkspaceComposerCard.0c5d6a479c', '[Optional]')}
          </span>
        </label>
        <div className="relative">
          <CaseSensitive className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.workspaceName}
            onChange={(e) => onChange({ ...value, workspaceName: e.target.value })}
            placeholder={translate(
              'auto.components.NewWorkspaceComposerCard.0ee17638fe',
              'Workspace name'
            )}
            className={cn('h-9 pl-8')}
          />
        </div>
      </div>
    </div>
  )
}
