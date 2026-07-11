import React from 'react'
import { ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function SidebarTodoNavButton(): React.JSX.Element {
  const openTodosPage = useAppStore((s) => s.openTodosPage)
  const activeView = useAppStore((s) => s.activeView)
  const todosActive = activeView === 'todos'

  return (
    <button
      type="button"
      onClick={() => openTodosPage()}
      aria-current={todosActive ? 'page' : undefined}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        todosActive
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <ListTodo
        className={cn('size-4 shrink-0', !todosActive && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={todosActive ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.SidebarTodoNavButton.title', 'TODO')}
      </span>
    </button>
  )
}
