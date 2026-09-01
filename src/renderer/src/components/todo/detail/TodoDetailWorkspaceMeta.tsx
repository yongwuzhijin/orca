import React from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { Worktree } from '../../../../../shared/worktree/types'
import { resolveTodoStartRepo } from '../../../../../shared/todo/resolve-todo-start-repo'
import { resolveTodoWorkspaceName } from '../../../../../shared/todo/todo-workspace-name'

function findWorktreeById(
  worktreesByRepo: Record<string, Worktree[]>,
  worktreeId: string | null
): Worktree | null {
  if (!worktreeId) {
    return null
  }
  for (const worktrees of Object.values(worktreesByRepo)) {
    const found = worktrees.find((worktree) => worktree.id === worktreeId)
    if (found) {
      return found
    }
  }
  return null
}

type TodoDetailWorkspaceMetaProps = {
  item: TodoItem
}

export function TodoDetailWorkspaceMeta({ item }: TodoDetailWorkspaceMetaProps): React.JSX.Element {
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const bound = findWorktreeById(worktreesByRepo, item.boundWorktreeId)
  const project = resolveTodoStartRepo({
    workspaceProjectId: item.workspaceProjectId,
    projectHostSetups
  })

  const workspaceName =
    bound?.displayName?.trim() ||
    item.workspaceName?.trim() ||
    (item.title.trim() ? resolveTodoWorkspaceName(item) : null)

  return (
    <div className="flex flex-col gap-2 px-2 pt-2">
      <MetaField
        label={translate(
          'auto.components.todo.detail.TodoDetailWorkspaceMeta.workspaceName',
          'Workspace'
        )}
        value={
          workspaceName ??
          translate('auto.components.todo.detail.TodoDetailWorkspaceMeta.notSet', 'Not set')
        }
      />
      <MetaField
        label={translate(
          'auto.components.todo.detail.TodoDetailWorkspaceMeta.projectPath',
          'Project path'
        )}
        value={
          project?.projectPath ??
          translate(
            'auto.components.todo.detail.TodoDetailWorkspaceMeta.noProject',
            'No project bound'
          )
        }
      />
      {bound ? (
        <MetaField
          label={translate(
            'auto.components.todo.detail.TodoDetailWorkspaceMeta.workspacePath',
            'Workspace path'
          )}
          value={bound.path}
          onClick={() => activateAndRevealWorktree(bound.id)}
        />
      ) : null}
    </div>
  )
}

function MetaField({
  label,
  value,
  onClick
}: {
  label: string
  value: string
  onClick?: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {onClick ? (
        <button
          type="button"
          className="break-all text-left text-xs text-foreground underline-offset-2 hover:underline"
          onClick={onClick}
        >
          {value}
        </button>
      ) : (
        <span className="break-all text-xs text-foreground">{value}</span>
      )}
    </div>
  )
}
