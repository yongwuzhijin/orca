import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import { resolveTodoStartRepo } from '../../../../shared/todo/resolve-todo-start-repo'
import { startTodoWorkspace, type TodoStartWorkspaceResult } from './detail/todo-start-workspace'
import { maybeStartPrdParse } from './todo-prd-parse'

export type CreateRequirementWorkspaceResult =
  | Exclude<TodoStartWorkspaceResult, { ok: true }>
  | { ok: true; worktreeId: string; path: string; displayName: string; item: TodoItem }

export async function createRequirementWorkspaceForItem(
  item: TodoItem
): Promise<CreateRequirementWorkspaceResult> {
  const workspace = await startTodoWorkspace(item)
  if (!workspace.ok) {
    return workspace
  }

  try {
    await window.api.todos.requirement.initWorktree({
      worktreePath: workspace.path,
      todoId: item.id,
      title: item.title,
      prdLink: item.prdLink
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.todo.todoCreateRequirementWorkspace.initFailed',
            'Failed to initialize requirement workspace files'
          )
    return { ok: false, reason: 'create-failed', message }
  }

  const updated = await useAppStore.getState().updateTodoItem(item.id, {
    boundWorktreeId: workspace.worktreeId
  })

  const { activateAndRevealWorktree } = await import('@/lib/worktree-activation')
  activateAndRevealWorktree(workspace.worktreeId)

  const state = useAppStore.getState()
  const resolved = resolveTodoStartRepo({
    workspaceProjectId: item.workspaceProjectId,
    projectHostSetups: state.projectHostSetups
  })
  const repo = resolved ? state.repos.find((entry) => entry.id === resolved.repoId) : undefined
  void maybeStartPrdParse({
    item: updated,
    worktreePath: workspace.path,
    connectionId: repo?.connectionId ?? undefined
  }).catch((error) => {
    console.error('[createRequirementWorkspaceForItem] PRD parse failed', error)
  })

  return { ...workspace, item: updated }
}
