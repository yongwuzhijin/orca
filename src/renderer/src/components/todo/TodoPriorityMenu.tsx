import React from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { TodoPriority } from '../../../../shared/todo/todo-priority'
import { TODO_PRIORITY_CATALOG, getTodoPriorityMeta } from './todo-priority-catalog'

type TodoPriorityMenuProps = {
  value: TodoPriority
  onChange: (priority: TodoPriority) => void
}

export function TodoPriorityOptionList({
  value,
  onChange
}: TodoPriorityMenuProps): React.JSX.Element {
  return (
    <div role="listbox" className="flex flex-col gap-0.5 p-1">
      {TODO_PRIORITY_CATALOG.map((meta) => {
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
            <Icon className={cn('size-4 shrink-0', meta.colorToken)} />
            <span className="flex-1">{translate(meta.labelKey, meta.fallbackLabel)}</span>
            {selected ? <Check className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          </button>
        )
      })}
    </div>
  )
}

export function TodoPriorityMenu({ value, onChange }: TodoPriorityMenuProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const meta = getTodoPriorityMeta(value)
  const Icon = meta.icon
  const isUnset = value === 'none'
  const label = isUnset
    ? translate('auto.components.todo.TodoPriorityMenu.setPriority', 'Set priority')
    : translate(meta.labelKey, meta.fallbackLabel)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-sm',
            'transition-colors hover:bg-accent',
            isUnset ? 'text-muted-foreground' : 'text-foreground'
          )}
          aria-label={translate(
            'auto.components.todo.TodoPriorityMenu.changePriorityAria',
            'Change priority'
          )}
        >
          <Icon className={cn('size-3.5 shrink-0', meta.colorToken)} />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0" sideOffset={6}>
        <TodoPriorityOptionList
          value={value}
          onChange={(next) => {
            onChange(next)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
