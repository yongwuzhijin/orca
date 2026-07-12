// src/renderer/src/components/todo/detail/ReviewDecisionBar.tsx
import React from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

type ReviewDecisionBarProps = {
  item: TodoItem
}

export function ReviewDecisionBar({ item }: ReviewDecisionBarProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => void updateTodoItem(item.id, { status: 'rework' })}
      >
        <X className="mr-1 size-4" />
        {translate('auto.components.todo.detail.ReviewDecisionBar.reject', 'Reject')}
      </Button>
      <Button size="sm" onClick={() => void updateTodoItem(item.id, { status: 'merging' })}>
        <Check className="mr-1 size-4" />
        {translate('auto.components.todo.detail.ReviewDecisionBar.approve', 'Approve')}
      </Button>
    </div>
  )
}
