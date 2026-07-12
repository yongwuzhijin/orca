import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import type { TodoStatus } from '../../../../../shared/todo/todo-status'
import { TodoStatusMenu } from '../TodoStatusMenu'
import { TodoDetailOverview } from './TodoDetailOverview'
import { InProgressPanel } from './InProgressPanel'
import { EnterInProgressDialog } from './EnterInProgressDialog'
import { HumanReviewPanel } from './HumanReviewPanel'

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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Button size="sm" variant="ghost" onClick={() => closeTodoDetail()}>
          <ArrowLeft className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{item.identifier}</span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{item.title}</h2>
        <div className="w-44">
          <TodoStatusMenu value={item.status} onChange={onStatusChange} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {item.status === 'in_progress' ? (
          <InProgressPanel item={item} />
        ) : item.status === 'human_review' ? (
          <HumanReviewPanel item={item} />
        ) : (
          <TodoDetailOverview item={item} />
        )}
      </div>

      {enterOpen ? <EnterInProgressDialog item={item} onClose={() => setEnterOpen(false)} /> : null}
    </div>
  )
}
