import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TODO_STATUS_CATALOG } from './todo-status-catalog'

type TodoStatusMenuProps = {
  value: TodoStatus
  onChange: (status: TodoStatus) => void
}

// Always-visible option list (no portal) so it is directly testable and reusable
// inside dialogs. Iterates the canonical catalog to guarantee status order.
export function TodoStatusOptionList({ value, onChange }: TodoStatusMenuProps): React.JSX.Element {
  return (
    <div role="listbox" className="flex flex-col gap-0.5">
      {TODO_STATUS_CATALOG.map((meta) => {
        const Icon = meta.icon
        const selected = value === meta.id
        return (
          <button
            key={meta.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(meta.id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
              selected && 'bg-accent'
            )}
          >
            {/* Spec §5: show status order number (1..9) as a leading fixed-width badge */}
            <span className="w-4 text-xs text-muted-foreground">{meta.order}</span>
            <Icon className={cn('size-4 shrink-0', meta.colorToken)} />
            <span className="flex-1">{translate(meta.labelKey, meta.fallbackLabel)}</span>
            {selected ? <Check className="size-4 shrink-0 text-muted-foreground" /> : null}
          </button>
        )
      })}
    </div>
  )
}

export function TodoStatusMenu({ value, onChange }: TodoStatusMenuProps): React.JSX.Element {
  return <TodoStatusOptionList value={value} onChange={onChange} />
}
