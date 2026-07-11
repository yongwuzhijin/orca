import React from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import type { TodoStatusMeta } from './todo-status-catalog'
import { TodoCard } from './TodoCard'

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
  const { setNodeRef } = useDroppable({ id: `column:${meta.id}` })
  const Icon = meta.icon
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 text-[13px] font-medium">
        <Icon className={cn('size-4', meta.colorToken)} />
        <span>{translate(meta.labelKey, meta.fallbackLabel)}</span>
        <span className="text-muted-foreground">{items.length}</span>
      </div>
      <div ref={setNodeRef} className="flex min-h-16 flex-col gap-2">
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <TodoCard key={item.id} item={item} onOpen={onOpenItem} />
          ))}
        </SortableContext>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={() => onCreate(meta.id)}
      >
        <Plus className="size-4" />
        {translate('auto.components.todo.TodoColumn.addTask', 'Add task')}
      </Button>
    </div>
  )
}
