import React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ACP_ENGINES, isAcpEngine, type AcpEngine } from '../../../../../shared/acp/acp-session'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import {
  resolveWorkspaceProjectCwd,
  TodoWorkspaceProjectPicker
} from '../TodoWorkspaceProjectPicker'

export function buildBasePrompt(item: TodoItem): string {
  const title = item.title.trimEnd()
  const description = item.description.trim()
  // Why: create flow often seeds description from title; concatenating both duplicates the prompt.
  if (!description || description === title.trim()) {
    return title
  }
  return `${title}\n\n${description}`
}

export function composePrompt(base: string, extra: string): string {
  const trimmed = extra.trim()
  return trimmed ? `${base}\n\n${trimmed}` : base
}

function resolveInitialEngine(item: TodoItem): AcpEngine {
  return item.preferredAgent && isAcpEngine(item.preferredAgent)
    ? item.preferredAgent
    : ACP_ENGINES[0]
}

type EnterInProgressDialogProps = {
  item: TodoItem
  onClose: () => void
}

export function EnterInProgressDialog({
  item,
  onClose
}: EnterInProgressDialogProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const executeTask = useAppStore((s) => s.executeTask)
  const openTodoDetail = useAppStore((s) => s.openTodoDetail)
  const project = useAppStore((s) => s.todoProjects.find((p) => p.id === item.projectId))
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)

  const [engine, setEngine] = React.useState<AcpEngine>(() => resolveInitialEngine(item))
  const [workspaceProjectId, setWorkspaceProjectId] = React.useState<string | null>(
    () => item.workspaceProjectId
  )
  const [extra, setExtra] = React.useState('')

  const cwd = resolveWorkspaceProjectCwd(
    workspaceProjectId,
    projectHostSetups,
    project?.defaultWorkingDir
  )
  const base = buildBasePrompt(item)
  const canStart = cwd.trim().length > 0

  const confirm = async (): Promise<void> => {
    if (!canStart) {
      return
    }
    // Persist the project choice so later restarts keep the same default.
    if (workspaceProjectId !== item.workspaceProjectId) {
      await updateTodoItem(item.id, { workspaceProjectId })
    }
    await updateTodoItem(item.id, { status: 'in_progress' })
    await executeTask({
      taskId: item.id,
      engine,
      prompt: composePrompt(base, extra),
      cwd: cwd.trim()
    })
    openTodoDetail(item.id)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {translate('auto.components.todo.detail.EnterInProgressDialog.title', 'Start task')}
          </h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-engine">
              {translate('auto.components.todo.detail.EnterInProgressDialog.engine', 'Engine')}
            </Label>
            <select
              id="enter-engine"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={engine}
              onChange={(e) => setEngine(e.target.value as AcpEngine)}
            >
              {ACP_ENGINES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          {/* Why: reuse the New Task project picker and seed from workspaceProjectId
              so Start Session continues from the project chosen at create time. */}
          <TodoWorkspaceProjectPicker
            value={workspaceProjectId}
            onChange={setWorkspaceProjectId}
            label={translate(
              'auto.components.todo.detail.EnterInProgressDialog.cwd',
              'Working directory'
            )}
          />

          <div className="flex flex-col gap-1.5">
            <Label>
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.basePrompt',
                'Base prompt'
              )}
            </Label>
            <pre className="scrollbar-sleek max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {base}
            </pre>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-extra">
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.extra',
                'Additional prompt'
              )}
            </Label>
            <textarea
              id="enter-extra"
              className="min-h-20 w-full rounded-md border border-input bg-transparent p-2 text-sm"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              {translate('auto.components.todo.detail.EnterInProgressDialog.cancel', 'Cancel')}
            </Button>
            <Button size="sm" disabled={!canStart} onClick={() => void confirm()}>
              {translate('auto.components.todo.detail.EnterInProgressDialog.start', 'Start')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
