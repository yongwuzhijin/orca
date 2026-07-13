// src/renderer/src/components/todo/detail/MergingPanel.tsx
import React from 'react'
import { GitMerge, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { MergeOutcome, MergePlan } from '../../../../../shared/todo/todo-merge'

type MergingPanelProps = { item: TodoItem }

type PanelState =
  | { phase: 'loading' }
  | { phase: 'ready'; plan: MergePlan }
  | { phase: 'merging'; plan: MergePlan }
  | { phase: 'conflict'; files: string[] }
  | { phase: 'error'; plan: MergePlan; message: string }

export function MergingPanel({ item }: MergingPanelProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const [state, setState] = React.useState<PanelState>({ phase: 'loading' })

  React.useEffect(() => {
    let cancelled = false
    void window.api.todos.merge.preview({ taskId: item.id }).then((plan) => {
      if (!cancelled) {
        setState({ phase: 'ready', plan })
      }
    })
    return () => {
      cancelled = true
    }
  }, [item.id])

  const runMerge = async (plan: MergePlan): Promise<void> => {
    setState({ phase: 'merging', plan })
    const res: MergeOutcome = await window.api.todos.merge.execute({ taskId: item.id })
    if (res.outcome === 'merged') {
      void updateTodoItem(item.id, { status: 'done' })
    } else if (res.outcome === 'conflict') {
      void updateTodoItem(item.id, { status: 'rework' })
      setState({ phase: 'conflict', files: res.conflictFiles })
    } else {
      setState({ phase: 'error', plan, message: res.message })
    }
  }

  if (state.phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {translate('auto.components.todo.detail.MergingPanel.detecting', 'Detecting merge target…')}
      </div>
    )
  }

  if (state.phase === 'conflict') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-2">
        <div className="flex items-center gap-2 text-amber-500">
          <AlertTriangle className="size-4" />
          {translate(
            'auto.components.todo.detail.MergingPanel.conflictTitle',
            'Merge conflict — moved to Rework'
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-auto rounded border border-border p-2 text-sm">
          {state.files.map((f) => (
            <li key={f} className="truncate font-mono">
              {f}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const plan = state.plan

  if (!plan.applicable) {
    const reasonText =
      plan.reason === 'already-on-base'
        ? translate(
            'auto.components.todo.detail.MergingPanel.alreadyOnBase',
            'Already on the base branch — no merge needed.'
          )
        : translate(
            'auto.components.todo.detail.MergingPanel.notApplicable',
            'Cannot auto-merge for this task.'
          )
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{reasonText}</p>
        <Button size="sm" onClick={() => void updateTodoItem(item.id, { status: 'done' })}>
          {translate('auto.components.todo.detail.MergingPanel.markDone', 'Mark done')}
        </Button>
      </div>
    )
  }

  const busy = state.phase === 'merging'
  return (
    <div className="flex h-full flex-col gap-4 p-2">
      <div className="rounded border border-border p-3 text-sm">
        <div className="mb-1 text-muted-foreground">
          {translate('auto.components.todo.detail.MergingPanel.repo', 'Repository')}:{' '}
          {plan.repoRoot}
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span>{plan.sourceBranch}</span>
          <span aria-hidden>→</span>
          <span>{plan.targetBranch}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {translate(
            'auto.components.todo.detail.MergingPanel.strategy',
            'Fast-forward if possible, otherwise a merge commit.'
          )}
        </div>
      </div>
      {state.phase === 'error' ? <p className="text-sm text-destructive">{state.message}</p> : null}
      <div className="flex justify-end">
        <Button size="sm" disabled={busy} onClick={() => void runMerge(plan)}>
          {busy ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <GitMerge className="mr-1 size-4" />
          )}
          {translate('auto.components.todo.detail.MergingPanel.merge', 'Merge')}
        </Button>
      </div>
    </div>
  )
}
