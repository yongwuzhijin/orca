import React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { joinRequirementPrdPath } from '../../../../../shared/todo/todo-requirement-worktree-paths'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { InProgressPanel } from './InProgressPanel'
import { useRequirementWorktreeId } from './use-requirement-worktree-id'

type RequirementPrdSupplementPaneProps = {
  item: TodoItem
}

export function RequirementPrdSupplementPane({
  item
}: RequirementPrdSupplementPaneProps): React.JSX.Element {
  const worktreeId = useRequirementWorktreeId(item)
  const worktree = useAppStore((s) =>
    worktreeId
      ? (s.getKnownWorktreeById(worktreeId, s.activeWorkspaceExecutionHostId ?? undefined) ?? null)
      : null
  )
  const executeTask = useAppStore((s) => s.executeTask)
  const activeSessionId = useAppStore((s) => s.activeSessionByTask[item.id] ?? null)
  const [starting, setStarting] = React.useState(false)

  const startSupplement = async (): Promise<void> => {
    if (!worktree) {
      return
    }
    setStarting(true)
    try {
      const prdPath = joinRequirementPrdPath(worktree.path)
      await executeTask({
        taskId: item.id,
        engine: 'qoder',
        prompt: [
          '请根据用户在对话中的补充说明，直接修改 PRD 文件。',
          `目标文件：${prdPath}`,
          '修改后保持 Markdown 结构清晰，并简要说明改动点。'
        ].join('\n'),
        cwd: worktree.path,
        autoPilot: { maxTurns: 10 }
      })
    } finally {
      setStarting(false)
    }
  }

  if (!worktreeId || !worktree) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate(
          'auto.components.todo.detail.RequirementPrdSupplementPane.noWorktree',
          'Workspace is not ready yet.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {!activeSessionId ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2">
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.todo.detail.RequirementPrdSupplementPane.hint',
              'Start a supplement session to let the agent edit prd.md from your instructions.'
            )}
          </p>
          <Button size="sm" disabled={starting} onClick={() => void startSupplement()}>
            {translate(
              'auto.components.todo.detail.RequirementPrdSupplementPane.start',
              'Start supplement'
            )}
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border p-3">
        <InProgressPanel item={item} showPlan={false} />
      </div>
    </div>
  )
}
