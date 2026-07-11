import React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { TodoBoard } from './TodoBoard'
import { TodoCreateDialog } from './TodoCreateDialog'
import { TodoDetailDialog } from './TodoDetailDialog'
import { TodoProjectSwitcher } from './TodoProjectSwitcher'

export default function TodoPage(): React.JSX.Element {
  const loadTodoProjects = useAppStore((s) => s.loadTodoProjects)
  const loadTodoTemplates = useAppStore((s) => s.loadTodoTemplates)
  const loadTodoItems = useAppStore((s) => s.loadTodoItems)
  const activeProjectId = useAppStore((s) => s.todoActiveProjectId)
  const items = useAppStore((s) => s.todoItems)
  const moveTodoItem = useAppStore((s) => s.moveTodoItem)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createStatus, setCreateStatus] = React.useState<TodoStatus | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  React.useEffect(() => {
    void loadTodoProjects()
    void loadTodoTemplates()
  }, [loadTodoProjects, loadTodoTemplates])

  // Why: loadTodoProjects auto-selects the first project but does not fetch its
  // items, so the board would be empty on first load without this.
  React.useEffect(() => {
    if (activeProjectId) {
      void loadTodoItems(activeProjectId)
    }
  }, [activeProjectId, loadTodoItems])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <TodoProjectSwitcher />
        <div className="flex-1" />
        <Button
          size="sm"
          disabled={!activeProjectId}
          onClick={() => {
            setCreateStatus(null)
            setCreateOpen(true)
          }}
        >
          <Plus className="size-4" />
          {translate('auto.components.todo.TodoPage.newTask', 'New task')}
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeProjectId ? (
          <TodoBoard
            items={items}
            onMove={(id, status, orderKey) => void moveTodoItem(id, status, orderKey)}
            onOpenItem={(id) => setDetailId(id)}
            onCreate={(status) => {
              setCreateStatus(status)
              setCreateOpen(true)
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {translate('auto.components.todo.TodoPage.empty', 'Create a project to get started')}
          </div>
        )}
      </div>
      {createOpen && activeProjectId ? (
        <TodoCreateDialog
          projectId={activeProjectId}
          initialStatus={createStatus ?? undefined}
          onClose={() => {
            setCreateOpen(false)
            setCreateStatus(null)
          }}
        />
      ) : null}
      {detailId ? <TodoDetailDialog itemId={detailId} onClose={() => setDetailId(null)} /> : null}
    </div>
  )
}
