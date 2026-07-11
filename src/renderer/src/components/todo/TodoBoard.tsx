import React from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { getVisibleTodoStatuses } from './todo-status-catalog'
import { orderKeyBetween } from '../../../../shared/todo/order-key'
import { TodoColumn } from './TodoColumn'

export function TodoBoard({
  items,
  onMove,
  onOpenItem,
  onCreate
}: {
  items: TodoItem[]
  onMove: (id: string, status: TodoStatus, orderKey: string) => void
  onOpenItem: (id: string) => void
  onCreate: (status: TodoStatus) => void
}): React.JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  // getVisibleTodoStatuses returns TodoStatusMeta[] in catalog order; derive the id set for drop checks.
  const visibleMetas = getVisibleTodoStatuses()
  const visibleIds = new Set<TodoStatus>(visibleMetas.map((meta) => meta.id))

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over) {
      return
    }
    const activeId = String(active.id)
    const overId = String(over.id)
    // Dropping a card onto itself is a no-op; without this, resolveDropTarget
    // returns beforeId=activeId which columnItems excludes, sending it to the front.
    if (activeId === overId) {
      return
    }
    const target = resolveDropTarget(overId, items, visibleIds)
    if (!target) {
      return
    }
    const columnItems = items
      .filter((i) => i.status === target.status && i.id !== activeId)
      .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))
    const index = target.beforeId
      ? columnItems.findIndex((i) => i.id === target.beforeId)
      : columnItems.length
    const prev = index > 0 ? (columnItems[index - 1]?.orderKey ?? null) : null
    const next =
      index >= 0 && index < columnItems.length ? (columnItems[index]?.orderKey ?? null) : null
    const orderKey = orderKeyBetween(prev, next)
    onMove(activeId, target.status, orderKey)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4">
        {visibleMetas.map((meta) => (
          <TodoColumn
            key={meta.id}
            meta={meta}
            items={items
              .filter((i) => i.status === meta.id)
              .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))}
            onOpenItem={onOpenItem}
            onCreate={onCreate}
          />
        ))}
      </div>
    </DndContext>
  )
}

function resolveDropTarget(
  overId: string,
  items: TodoItem[],
  visibleIds: Set<TodoStatus>
): { status: TodoStatus; beforeId: string | null } | null {
  if (overId.startsWith('column:')) {
    const status = overId.slice('column:'.length) as TodoStatus
    return visibleIds.has(status) ? { status, beforeId: null } : null
  }
  const overItem = items.find((i) => i.id === overId)
  if (!overItem) {
    return null
  }
  return { status: overItem.status, beforeId: overItem.id }
}
