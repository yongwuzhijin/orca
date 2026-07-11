import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import { getTodoStatusMeta } from './todo-status-catalog'
import { getTodoPriorityMeta } from './todo-priority-catalog'

export function TodoCard({
  item,
  onOpen
}: {
  item: TodoItem
  onOpen: (id: string) => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id
  })
  const statusMeta = getTodoStatusMeta(item.status)
  const priorityMeta = getTodoPriorityMeta(item.priority)
  const StatusIcon = statusMeta.icon
  const PriorityIcon = priorityMeta.icon

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.id)}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-ring',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <StatusIcon className={cn('size-3.5', statusMeta.colorToken)} />
        <span>{item.identifier}</span>
      </div>
      <span className="text-[13px] font-medium leading-snug">{item.title}</span>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityIcon className={cn('size-3.5', priorityMeta.colorToken)} />
        {item.scheduledDate ? <span>{item.scheduledDate}</span> : null}
        {item.labels.length > 0 ? <span>#{item.labels[0]}</span> : null}
      </div>
    </button>
  )
}
