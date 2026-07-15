import React from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import type { TodoStatusMeta } from './todo-status-catalog'
import { TodoCard } from './TodoCard'
import { isTodoDueToday } from './todo-today-filter'

export function TodoColumn({
  meta,
  items,
  onOpenItem,
  onCreate
}: {
  meta: TodoStatusMeta
  items: TodoItem[]
  onOpenItem: (id: string) => void
  onCreate: (status: TodoStatus) => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${meta.id}` })
  const Icon = meta.icon
  // Spec §42/§245: only the Todo column defaults to a "due today or overdue" view
  // with a 今天/全部 toggle; other columns always show every item.
  const isTodoStatus = meta.id === 'todo'
  const [showAll, setShowAll] = React.useState(false)
  const visibleItems = isTodoStatus && !showAll ? items.filter((i) => isTodoDueToday(i)) : items
  const statusLabel = translate(meta.labelKey, meta.fallbackLabel)
  const createTooltip = translate(
    'auto.components.todo.TodoColumn.addTaskInStatus',
    'New task in {{status}}',
    { status: statusLabel }
  )

  const headerCreateButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="size-6 text-muted-foreground"
      aria-label={createTooltip}
      onClick={() => onCreate(meta.id)}
    >
      <Plus className="size-3.5" />
    </Button>
  )

  return (
    <section
      className={cn(
        'group/lane',
        'relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-t-2 border-border transition-colors',
        meta.laneBorder,
        meta.laneTint,
        isOver && 'border-ring bg-accent/70'
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 py-0 pl-3 pr-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Icon className={cn('size-3.5 shrink-0', meta.colorToken)} />
          <div className="min-w-0 truncate text-[12px] font-semibold text-foreground">
            {statusLabel}
          </div>
          <div className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium leading-none text-muted-foreground">
            {visibleItems.length}
          </div>
          {isTodoStatus ? (
            <div className="ml-1 flex items-center gap-1 text-[10px]">
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className={cn(!showAll ? 'text-foreground' : 'text-muted-foreground')}
              >
                {translate('auto.components.todo.TodoColumn.today', 'Today')}
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={cn(showAll ? 'text-foreground' : 'text-muted-foreground')}
              >
                {translate('auto.components.todo.TodoColumn.all', 'All')}
              </button>
            </div>
          ) : null}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>{headerCreateButton}</TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {createTooltip}
          </TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={setNodeRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2 scrollbar-sleek"
      >
        {visibleItems.length > 0 ? (
          <SortableContext
            items={visibleItems.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <TodoCard key={item.id} item={item} onOpen={onOpenItem} />
              ))}
            </div>
          </SortableContext>
        ) : (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/70 text-[11px] text-muted-foreground">
            {translate('auto.components.todo.TodoColumn.empty', 'Empty')}
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className={cn(
                'mt-2 h-7 w-full can-hover:opacity-0 transition-opacity',
                'group-hover/lane:opacity-100 group-focus-within/lane:opacity-100'
              )}
              aria-label={createTooltip}
              onClick={() => onCreate(meta.id)}
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {createTooltip}
          </TooltipContent>
        </Tooltip>
      </div>
    </section>
  )
}
