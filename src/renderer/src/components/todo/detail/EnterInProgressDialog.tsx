import React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ACP_ENGINES, isAcpEngine, type AcpEngine } from '../../../../../shared/acp/acp-session'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../../shared/todo/todo-status'
import {
  resolveWorkspaceProjectCwd,
  TodoWorkspaceProjectPicker
} from '../TodoWorkspaceProjectPicker'

import { buildBasePrompt, composePrompt } from '../../../../../shared/todo/todo-base-prompt'
import {
  buildDesignHandoffPrompt,
  buildDesignStagePrompt
} from '../../../../../shared/todo/todo-design-prompt'
import { DEFAULT_TODO_DESIGN_STAGE_SKILL } from '../../../../../shared/constants'

export { buildBasePrompt, composePrompt }

function resolveInitialEngine(item: TodoItem): AcpEngine {
  return item.preferredAgent && isAcpEngine(item.preferredAgent)
    ? item.preferredAgent
    : ACP_ENGINES[0]
}

type EnterInProgressDialogProps = {
  item: TodoItem
  onClose: () => void
  // 'from-design' starts the implementation that follows an approved design, so the stage is over.
  mode?: 'todo' | 'from-design'
  designDocNames?: readonly string[]
}

export function EnterInProgressDialog({
  item,
  onClose,
  mode = 'todo',
  designDocNames
}: EnterInProgressDialogProps): React.JSX.Element {
  const updateTodoItem = useAppStore((s) => s.updateTodoItem)
  const executeTask = useAppStore((s) => s.executeTask)
  const openTodoDetail = useAppStore((s) => s.openTodoDetail)
  const project = useAppStore((s) => s.todoProjects.find((p) => p.id === item.projectId))
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const designStageSkill = useAppStore(
    (s) => s.settings?.todoDesignStageSkill ?? DEFAULT_TODO_DESIGN_STAGE_SKILL
  )

  const [engine, setEngine] = React.useState<AcpEngine>(() => resolveInitialEngine(item))
  const [workspaceProjectId, setWorkspaceProjectId] = React.useState<string | null>(
    () => item.workspaceProjectId
  )
  const [extra, setExtra] = React.useState('')
  const [autoPilotOn, setAutoPilotOn] = React.useState(true)
  const [maxTurns, setMaxTurns] = React.useState(10)
  const [designStage, setDesignStage] = React.useState(item.designStageEnabled)

  const cwd = resolveWorkspaceProjectCwd(
    workspaceProjectId,
    projectHostSetups,
    project?.defaultWorkingDir
  )
  const designStageAvailable = designStageSkill.length > 0
  const useDesignStage = mode !== 'from-design' && designStage && designStageAvailable
  // Why: one value for both the preview and the dispatch, so the user never sees a different prompt.
  const base =
    mode === 'from-design'
      ? buildDesignHandoffPrompt(item, designDocNames ?? [])
      : useDesignStage
        ? buildDesignStagePrompt(item, designStageSkill)
        : buildBasePrompt(item)
  const canStart = cwd.trim().length > 0

  const confirm = async (): Promise<void> => {
    if (!canStart) {
      return
    }
    // Persist the project choice so later restarts keep the same default.
    if (workspaceProjectId !== item.workspaceProjectId) {
      await updateTodoItem(item.id, { workspaceProjectId })
    }
    const nextStatus: TodoStatus = useDesignStage ? 'solution_design' : 'in_progress'
    await updateTodoItem(item.id, { status: nextStatus, designStageEnabled: useDesignStage })
    await executeTask({
      taskId: item.id,
      engine,
      prompt: composePrompt(base, extra),
      cwd: cwd.trim(),
      autoPilot: autoPilotOn ? { maxTurns } : undefined
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

          <div className="flex items-center gap-3">
            <input
              id="enter-autopilot"
              type="checkbox"
              className="size-4"
              checked={autoPilotOn}
              onChange={(e) => setAutoPilotOn(e.target.checked)}
            />
            <Label htmlFor="enter-autopilot" className="cursor-pointer">
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.autoPilot',
                'AutoPilot (advance autonomously)'
              )}
            </Label>
            {autoPilotOn ? (
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor="enter-max-turns" className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.todo.detail.EnterInProgressDialog.maxTurns',
                    'Max turns'
                  )}
                </Label>
                <input
                  id="enter-max-turns"
                  type="number"
                  min={1}
                  className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={maxTurns}
                  onChange={(e) => setMaxTurns(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            ) : null}
          </div>

          {mode === 'from-design' ? null : (
            <div className="flex items-center gap-3">
              <input
                id="enter-design-stage"
                data-testid="enter-design-stage"
                type="checkbox"
                className="size-4"
                checked={designStage && designStageAvailable}
                disabled={!designStageAvailable}
                onChange={(e) => setDesignStage(e.target.checked)}
              />
              <Label htmlFor="enter-design-stage" className="cursor-pointer">
                {translate(
                  'auto.components.todo.detail.EnterInProgressDialog.designStage',
                  'Design the solution first'
                )}
              </Label>
              {designStageAvailable ? null : (
                <span className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.todo.detail.EnterInProgressDialog.designStageUnset',
                    'Set a solution design skill in Settings to enable this stage'
                  )}
                </span>
              )}
            </div>
          )}

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
