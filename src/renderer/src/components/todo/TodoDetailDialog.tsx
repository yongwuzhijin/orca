import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TodoPriority } from '../../../../shared/todo/todo-priority'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TODO_PRIORITY_CATALOG } from './todo-priority-catalog'
import { TodoStatusMenu } from './TodoStatusMenu'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

type TodoDetailDialogProps = {
  itemId: string
  onClose: () => void
}

export function TodoDetailDialog({
  itemId,
  onClose
}: TodoDetailDialogProps): React.JSX.Element | null {
  const item = useAppStore((s) => s.todoItems.find((i) => i.id === itemId))
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)

  // Item may vanish (deleted elsewhere / project switch); render nothing then.
  if (!item) {
    return null
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <div className="flex min-h-0 gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="text-xs text-muted-foreground">{item.identifier}</span>
            <h2 className="text-lg font-semibold leading-snug">{item.title}</h2>
            <div className="min-h-32 max-h-[60vh] overflow-y-auto">
              <MarkdownPreview
                content={item.description || '_No description_'}
                filePath={`todo/${item.id}.md`}
                scrollCacheKey={`todo-detail:${item.id}`}
              />
            </div>
          </div>

          <aside className="flex w-48 shrink-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>
                {translate('auto.components.todo.TodoDetailDialog.statusLabel', 'Status')}
              </Label>
              <TodoStatusMenu
                value={item.status}
                onChange={(status: TodoStatus) => void updateTodoItem(item.id, { status })}
              />
            </div>

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
      </DialogContent>
    </Dialog>
  )
}
