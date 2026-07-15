import React from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TODO_STATUS_CATALOG, getTodoStatusMeta } from './todo-status-catalog'

type TodoStatusMenuProps = {
  value: TodoStatus
  onChange: (status: TodoStatus) => void
}

// Always-visible option list so it stays testable and reusable inside the
// dropdown (and any future dialog that needs the bare list).
export function TodoStatusOptionList({
  value,
  onChange,
  query = ''
}: TodoStatusMenuProps & { query?: string }): React.JSX.Element {
  const normalized = query.trim().toLowerCase()
  const options = TODO_STATUS_CATALOG.filter((meta) => {
    if (!normalized) {
      return true
    }
    const label = translate(meta.labelKey, meta.fallbackLabel).toLowerCase()
    return label.includes(normalized) || meta.id.includes(normalized)
  })

  return (
    <div role="listbox" className="flex flex-col gap-0.5 p-1">
      {options.map((meta) => {
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
            <span className="w-4 text-right text-xs text-muted-foreground">{meta.order}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TodoStatusMenu({ value, onChange }: TodoStatusMenuProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const meta = getTodoStatusMeta(value)
  const Icon = meta.icon
  const label = translate(meta.labelKey, meta.fallbackLabel)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery('')
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 max-w-full items-center gap-1.5 rounded-md px-2 text-sm',
            'text-foreground transition-colors hover:bg-accent'
          )}
          aria-label={translate(
            'auto.components.todo.TodoStatusMenu.changeStatusAria',
            'Change status'
          )}
        >
          <Icon className={cn('size-3.5 shrink-0', meta.colorToken)} />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" sideOffset={6}>
        <div className="border-b border-border px-2 py-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translate(
              'auto.components.todo.TodoStatusMenu.changeStatusPlaceholder',
              'Change status...'
            )}
            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <TodoStatusOptionList
          value={value}
          query={query}
          onChange={(next) => {
            onChange(next)
            setOpen(false)
            setQuery('')
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
