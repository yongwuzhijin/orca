import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ACP_ENGINES, type AcpEngine } from '../../../../../shared/acp/acp-session'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

export function buildBasePrompt(item: TodoItem): string {
  return `${item.title}\n\n${item.description}`.trimEnd()
}

export function composePrompt(base: string, extra: string): string {
  const trimmed = extra.trim()
  return trimmed ? `${base}\n\n${trimmed}` : base
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

  const [engine, setEngine] = React.useState<AcpEngine>(ACP_ENGINES[0])
  const [cwd, setCwd] = React.useState(project?.defaultWorkingDir ?? '')
  const [extra, setExtra] = React.useState('')

  const base = buildBasePrompt(item)

  const confirm = async (): Promise<void> => {
    if (!cwd.trim()) {
      return
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

  const pickDir = async (): Promise<void> => {
    const picked = await window.api.shell.pickDirectory({ defaultPath: cwd || undefined })
    if (picked) {
      setCwd(picked)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {translate('auto.components.todo.detail.EnterInProgressDialog.title', 'Start session')}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enter-cwd">
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.cwd',
                'Working directory'
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                id="enter-cwd"
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/path/to/repo"
              />
              <Button size="sm" variant="outline" onClick={() => void pickDir()}>
                {translate('auto.components.todo.detail.EnterInProgressDialog.browse', 'Browse…')}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.basePrompt',
                'Base prompt'
              )}
            </Label>
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
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
            <Button size="sm" disabled={!cwd.trim()} onClick={() => void confirm()}>
              {translate('auto.components.todo.detail.EnterInProgressDialog.start', 'Start')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
