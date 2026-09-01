import { slugifyForWorkspaceName } from '../workspace-name'

export function resolveTodoWorkspaceName(
  item: Pick<{ workspaceName: string | null; title: string }, 'workspaceName' | 'title'>
): string {
  const named = item.workspaceName?.trim()
  if (named) {
    return named
  }
  return slugifyForWorkspaceName(item.title) || 'workspace'
}
