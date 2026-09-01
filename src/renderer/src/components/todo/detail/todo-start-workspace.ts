import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { resolveTodoStartRepo } from '../../../../../shared/todo/resolve-todo-start-repo'
import { resolveTodoWorkspaceName } from '../../../../../shared/todo/todo-workspace-name'

export type TodoStartWorkspaceResult =
  | { ok: true; worktreeId: string; path: string; displayName: string }
  | {
      ok: false
      reason: 'no-project' | 'unsupported-folder' | 'create-failed'
      message: string
    }

export async function startTodoWorkspace(item: TodoItem): Promise<TodoStartWorkspaceResult> {
  const state = useAppStore.getState()
  const resolved = resolveTodoStartRepo({
    workspaceProjectId: item.workspaceProjectId,
    projectHostSetups: state.projectHostSetups
  })
  if (!resolved) {
    return {
      ok: false,
      reason: 'no-project',
      message: translate(
        'auto.components.todo.detail.todoStartWorkspace.noProject',
        'Bind a project on this requirement before starting.'
      )
    }
  }

  const repo = state.repos.find((entry) => entry.id === resolved.repoId)
  if (!repo || repo.kind === 'folder') {
    return {
      ok: false,
      reason: 'unsupported-folder',
      message: translate(
        'auto.components.todo.detail.todoStartWorkspace.unsupportedFolder',
        'Folder projects cannot auto-create a worktree yet.'
      )
    }
  }

  const name = resolveTodoWorkspaceName(item)
  const displayName = item.workspaceName?.trim() || item.title.trim() || name

  try {
    const result = await state.createWorktree(
      resolved.repoId,
      name,
      undefined,
      'skip',
      undefined,
      'unknown',
      displayName
    )
    return {
      ok: true,
      worktreeId: result.worktree.id,
      path: result.worktree.path,
      displayName: result.worktree.displayName || displayName
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : translate(
            'auto.components.todo.detail.todoStartWorkspace.createFailed',
            'Failed to create workspace'
          )
    return { ok: false, reason: 'create-failed', message }
  }
}
