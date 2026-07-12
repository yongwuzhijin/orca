import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { TodoPriority } from '../../../../../shared/todo/todo-priority'
import { TODO_PRIORITY_CATALOG } from '../todo-priority-catalog'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

type TodoDetailOverviewProps = {
  item: TodoItem
}

export function TodoDetailOverview({ item }: TodoDetailOverviewProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-h-32 flex-1 overflow-y-auto scrollbar-sleek">
          <MarkdownPreview
            content={item.description || '_No description_'}
            filePath={`todo/${item.id}.md`}
            scrollCacheKey={`todo-detail:${item.id}`}
          />
        </div>
      </div>
      <aside className="flex w-48 shrink-0 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="todo-detail-priority">
            {translate('auto.components.todo.TodoDetailDialog.priorityLabel', 'Priority')}
          </Label>
          <select
            id="todo-detail-priority"
            className={cn(SELECT_CLASS)}
            value={item.priority}
            onChange={(e) =>
              void updateTodoItem(item.id, { priority: e.target.value as TodoPriority })
            }
          >
            {TODO_PRIORITY_CATALOG.map((meta) => (
              <option key={meta.id} value={meta.id}>
                {translate(meta.labelKey, meta.fallbackLabel)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="todo-detail-date">
            {translate('auto.components.todo.TodoDetailDialog.scheduledLabel', 'Scheduled')}
          </Label>
          <Input
            id="todo-detail-date"
            type="date"
            value={item.scheduledDate ?? ''}
            onChange={(e) =>
              void updateTodoItem(item.id, { scheduledDate: e.target.value || null })
            }
          />
        </div>
      </aside>
    </div>
  )
}
