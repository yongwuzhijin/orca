import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../../shared/todo/todo-status'
import type { TodoPriority } from '../../../../../shared/todo/todo-priority'
import { TodoStatusMenu } from '../TodoStatusMenu'
import { TodoPriorityMenu } from '../TodoPriorityMenu'
import { TodoDetailOverview } from './TodoDetailOverview'
import { InProgressPanel } from './InProgressPanel'
import { EnterInProgressDialog } from './EnterInProgressDialog'
import { HumanReviewPanel } from './HumanReviewPanel'
import { MergingPanel } from './MergingPanel'
import { ReviewDecisionBar } from './ReviewDecisionBar'

type TodoDetailViewProps = {
  itemId: string
}

export function TodoDetailView({ itemId }: TodoDetailViewProps): React.JSX.Element | null {
  const item = useAppStore((s) => s.todoItems.find((i) => i.id === itemId))
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const closeTodoDetail = useAppStore((s) => s.closeTodoDetail)
  const [enterOpen, setEnterOpen] = React.useState(false)

  // Item vanished (deleted / project switch) -> return to the board.
  React.useEffect(() => {
    if (!item) {
      closeTodoDetail()
    }
  }, [item, closeTodoDetail])

  if (!item) {
    return null
  }

  const onStatusChange = (next: TodoStatus): void => {
    // Spec §5: entering in_progress is intercepted to launch the session dialog.
    if (next === 'in_progress' && item.status !== 'in_progress') {
      setEnterOpen(true)
      return
    }
    void updateTodoItem(item.id, { status: next })
  }

  const onPriorityChange = (next: TodoPriority): void => {
    void updateTodoItem(item.id, { priority: next })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Button size="sm" variant="ghost" onClick={() => closeTodoDetail()}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{item.identifier}</span>
        <div className="flex-1" />
        {item.status === 'backlog' || item.status === 'todo' ? (
          <Button size="sm" onClick={() => setEnterOpen(true)}>
            {translate('auto.components.todo.detail.TodoDetailView.startTask', 'Start task')}
          </Button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden px-6 py-5">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">{item.title}</h1>
          <div className="min-h-0 flex-1 overflow-hidden">
            {item.status === 'in_progress' ? (
              <InProgressPanel item={item} />
            ) : item.status === 'human_review' ? (
              <HumanReviewPanel item={item} />
            ) : item.status === 'merging' ? (
              <MergingPanel item={item} />
            ) : (
              <TodoDetailOverview item={item} />
            )}
          </div>
        </div>

        {/* Why: Linear-style property rail — status/priority/date live here so the
            main column stays focused on description / execution panels. */}
        <aside className="flex w-56 shrink-0 flex-col gap-1 border-l border-border px-3 py-5">
          <div className="flex flex-col gap-0.5">
            <span className="px-2 text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.todo.TodoDetailDialog.statusLabel', 'Status')}
            </span>
            <TodoStatusMenu value={item.status} onChange={onStatusChange} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="px-2 text-[11px] font-medium text-muted-foreground">
              {translate('auto.components.todo.TodoDetailDialog.priorityLabel', 'Priority')}
            </span>
            <TodoPriorityMenu value={item.priority} onChange={onPriorityChange} />
          </div>
          <div className="flex flex-col gap-0.5 px-2 pt-1">
            <label
              htmlFor="todo-detail-date"
              className="text-[11px] font-medium text-muted-foreground"
            >
              {translate('auto.components.todo.TodoDetailDialog.scheduledLabel', 'Scheduled')}
            </label>
            {/* Why: scheduled date is set at create time; detail rail is display-only. */}
            <Input
              id="todo-detail-date"
              type="date"
              className="h-8"
              value={item.scheduledDate ?? ''}
              disabled
              readOnly
            />
          </div>
          <div className="flex flex-col gap-1 px-2 pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="todo-autopilot-eligible"
                checked={item.autoPilotEnabled}
                onCheckedChange={(checked) =>
                  void updateTodoItem(item.id, { autoPilotEnabled: checked === true })
                }
              />
              <Label
                htmlFor="todo-autopilot-eligible"
                className="cursor-pointer text-[11px] font-medium text-muted-foreground"
              >
                {translate(
                  'auto.components.todo.detail.TodoDetailView.autoPilotEligible',
                  'AutoPilot eligible'
                )}
              </Label>
            </div>
            {item.autoPilotEnabled ? (
              <div className="flex flex-col gap-0.5 pt-1">
                <label
                  htmlFor="todo-autopilot-max-turns"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  {translate(
                    'auto.components.todo.detail.TodoDetailView.autoPilotMaxTurns',
                    'Max turns'
                  )}
                </label>
                <Input
                  id="todo-autopilot-max-turns"
                  type="number"
                  min={1}
                  className="h-8"
                  value={item.autoPilotMaxTurns ?? ''}
                  placeholder={translate(
                    'auto.components.todo.detail.TodoDetailView.autoPilotMaxTurnsPlaceholder',
                    'Global default'
                  )}
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    const next = raw === '' ? null : Math.max(1, Math.floor(Number(raw) || 1))
                    void updateTodoItem(item.id, { autoPilotMaxTurns: next })
                  }}
                />
              </div>
            ) : null}
          </div>
          {item.status === 'human_review' ? (
            <div className="px-2 pt-3">
              <ReviewDecisionBar item={item} />
            </div>
          ) : null}
        </aside>
      </div>

      {enterOpen ? <EnterInProgressDialog item={item} onClose={() => setEnterOpen(false)} /> : null}
    </div>
  )
}
