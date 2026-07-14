import React from 'react'
import { CaseSensitive } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ACP_ENGINES, type AcpEngine } from '../../../../shared/acp/acp-session'
import { TodoWorkspaceProjectPicker } from './TodoWorkspaceProjectPicker'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

const ACP_ENGINE_LABELS: Record<AcpEngine, string> = {
  claude: 'Claude',
  qoder: 'Qoder',
  cursor: 'Cursor'
}

export type TodoCreateWorkspaceFieldsValue = {
  workspaceProjectId: string | null
  workspaceName: string
  preferredAgent: AcpEngine
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
      <TodoWorkspaceProjectPicker
        value={value.workspaceProjectId}
        onChange={(projectId) => onChange({ ...value, workspaceProjectId: projectId })}
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

      <div className="space-y-1">
        <label
          htmlFor="todo-create-acp-engine"
          className="text-xs font-medium text-muted-foreground"
        >
          {translate('auto.components.NewWorkspaceComposerCard.01d1e8f601', 'Agent')}
        </label>
        {/* Why: todo execution goes through ACP; only engines in ACP_ENGINES are supported
            (same set as EnterInProgressDialog). */}
        <select
          id="todo-create-acp-engine"
          className={SELECT_CLASS}
          value={value.preferredAgent}
          onChange={(e) => onChange({ ...value, preferredAgent: e.target.value as AcpEngine })}
        >
          {ACP_ENGINES.map((engine) => (
            <option key={engine} value={engine}>
              {ACP_ENGINE_LABELS[engine]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
