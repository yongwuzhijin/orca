import React from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { buildClarificationAgentPrompt } from '../../../../../shared/todo/clarification-state'
import {
  joinRequirementClarificationPath,
  joinRequirementPrdPath
} from '../../../../../shared/todo/todo-requirement-worktree-paths'
import type {
  ClarificationItem,
  ClarificationState
} from '../../../../../shared/todo/todo-clarification-template'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { ClarificationTemplatePicker } from '../ClarificationTemplatePicker'
import { useRequirementWorktreeId } from './use-requirement-worktree-id'

type RequirementClarificationPaneProps = {
  item: TodoItem
}

export function RequirementClarificationPane({
  item
}: RequirementClarificationPaneProps): React.JSX.Element {
  const worktreeId = useRequirementWorktreeId(item)
  const worktree = useAppStore((s) =>
    worktreeId
      ? (s.getKnownWorktreeById(worktreeId, s.activeWorkspaceExecutionHostId ?? undefined) ?? null)
      : null
  )
  const executeTask = useAppStore((s) => s.executeTask)
  const [state, setState] = React.useState<ClarificationState>({ items: [] })
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [templateId, setTemplateId] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)

  const loadClarification = React.useCallback(async (): Promise<void> => {
    if (!worktree) {
      setLoading(false)
      return
    }
    const result = await window.api.todos.requirement.readClarification({
      worktreePath: worktree.path
    })
    setState(result.state)
    setParseError(result.parseError)
  }, [worktree])

  React.useEffect(() => {
    let cancelled = false
    void loadClarification()
      .catch((error: unknown) => {
        if (!cancelled) {
          setParseError(error instanceof Error ? error.message : 'Failed to load clarification.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadClarification])

  const refreshClarification = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await loadClarification()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.todo.detail.RequirementClarificationPane.refreshFailed',
              'Failed to refresh clarification items.'
            )
      )
    } finally {
      setRefreshing(false)
    }
  }

  const persist = async (next: ClarificationState): Promise<void> => {
    if (!worktree) {
      return
    }
    setState(next)
    setParseError(null)
    await window.api.todos.requirement.writeClarification({
      worktreePath: worktree.path,
      state: next
    })
  }

  const updateItem = async (
    id: string,
    patch: Partial<Pick<ClarificationItem, 'status' | 'answer'>>
  ): Promise<void> => {
    const now = new Date().toISOString()
    const items = state.items.map((entry) =>
      entry.id === id ? { ...entry, ...patch, updatedAt: now } : entry
    )
    await persist({ ...state, items })
  }

  const startClarification = async (): Promise<void> => {
    if (!worktree || !templateId) {
      return
    }
    const template = useAppStore
      .getState()
      .todoClarificationTemplates.find((entry) => entry.id === templateId)
    if (!template) {
      return
    }
    setRunning(true)
    try {
      const prompt = buildClarificationAgentPrompt({
        templateBody: template.body,
        prdPath: joinRequirementPrdPath(worktree.path),
        clarificationPath: joinRequirementClarificationPath(worktree.path)
      })
      await executeTask({
        taskId: item.id,
        engine: 'qoder',
        prompt,
        cwd: worktree.path,
        autoPilot: { maxTurns: 12 }
      })
      toast.message(
        translate(
          'auto.components.todo.detail.RequirementClarificationPane.started',
          'Clarification started.'
        )
      )
    } finally {
      setRunning(false)
    }
  }

  const applyClarification = async (): Promise<void> => {
    if (!worktree) {
      return
    }
    const answered = state.items.filter(
      (entry) => entry.status === 'answered' && entry.answer?.trim()
    )
    if (answered.length === 0) {
      toast.error(
        translate(
          'auto.components.todo.detail.RequirementClarificationPane.noAnswers',
          'Answer at least one clarification item first.'
        )
      )
      return
    }
    const prdPath = joinRequirementPrdPath(worktree.path)
    const prompt = [
      `请根据以下澄清答复更新 PRD 文件 ${prdPath}，输出完整、可评审的 PRD。`,
      '',
      ...answered.map(
        (entry, index) => `${index + 1}. Q: ${entry.question}\n   A: ${entry.answer?.trim() ?? ''}`
      )
    ].join('\n')
    await executeTask({
      taskId: item.id,
      engine: 'qoder',
      prompt,
      cwd: worktree.path,
      autoPilot: { maxTurns: 12 }
    })
    await persist({ ...state, revisedAt: new Date().toISOString() })
    toast.message(
      translate(
        'auto.components.todo.detail.RequirementClarificationPane.applyStarted',
        'Updating PRD from clarification answers.'
      )
    )
  }

  if (!worktreeId || !worktree) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate(
          'auto.components.todo.detail.RequirementClarificationPane.noWorktree',
          'Workspace is not ready yet.'
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {translate('auto.components.todo.detail.RequirementClarificationPane.loading', 'Loading…')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto scrollbar-sleek">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <ClarificationTemplatePicker value={templateId} onSelect={setTemplateId} />
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={refreshing}
          onClick={() => void refreshClarification()}
        >
          <RefreshCw className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {translate('auto.components.todo.detail.RequirementClarificationPane.refresh', 'Refresh')}
        </Button>
        <Button
          size="sm"
          disabled={!templateId || running}
          onClick={() => void startClarification()}
        >
          {translate(
            'auto.components.todo.detail.RequirementClarificationPane.start',
            'Start clarification'
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void applyClarification()}>
          {translate(
            'auto.components.todo.detail.RequirementClarificationPane.apply',
            'Apply to PRD'
          )}
        </Button>
      </div>

      {parseError ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          {parseError}
        </p>
      ) : null}

      {state.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.todo.detail.RequirementClarificationPane.empty',
            'No clarification items yet.'
          )}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {state.items.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">{entry.question}</p>
              {entry.context ? (
                <p className="mt-1 text-xs text-muted-foreground">{entry.context}</p>
              ) : null}
              <Textarea
                className="mt-2 min-h-16"
                value={entry.answer ?? ''}
                placeholder={translate(
                  'auto.components.todo.detail.RequirementClarificationPane.answerPlaceholder',
                  'Your answer'
                )}
                onChange={(event) => {
                  const answer = event.target.value
                  void updateItem(entry.id, {
                    answer,
                    status: answer.trim() ? 'answered' : 'open'
                  })
                }}
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant={entry.status === 'invalid' ? 'default' : 'outline'}
                  onClick={() => void updateItem(entry.id, { status: 'invalid' })}
                >
                  {translate(
                    'auto.components.todo.detail.RequirementClarificationPane.invalid',
                    'Invalid'
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
