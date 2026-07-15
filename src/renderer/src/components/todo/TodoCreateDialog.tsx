import React from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { CreateTodoItemInput } from '../../../../shared/todo/todo-item'
import type { TodoPriority } from '../../../../shared/todo/todo-priority'
import type { TodoStatus } from '../../../../shared/todo/todo-status'
import { ACP_ENGINES, type AcpEngine } from '../../../../shared/acp/acp-session'
import { TODO_STATUS_CATALOG } from './todo-status-catalog'
import { TODO_PRIORITY_CATALOG } from './todo-priority-catalog'
import { TodoTemplatePicker } from './todo-template-picker'
import {
  TodoCreateWorkspaceFields,
  type TodoCreateWorkspaceFieldsValue
} from './TodoCreateWorkspaceFields'

export type CreateTodoFormValues = {
  projectId: string
  title: string
  description?: string
  status?: TodoStatus
  priority?: TodoPriority
  scheduledDate?: string | null
  estimate?: number | null
  labels?: string[]
  templateId?: string | null
  workspaceProjectId?: string | null
  workspaceName?: string | null
  preferredAgent?: AcpEngine | null
}

const TEXTAREA_CLASS =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/60'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

// Pure payload builder: trims the title and includes optional fields only when
// they carry a meaningful value, so we never send empty strings to the backend.
export function buildCreateTodoPayload(values: CreateTodoFormValues): CreateTodoItemInput {
  const payload: CreateTodoItemInput = {
    projectId: values.projectId,
    title: values.title.trim()
  }
  if (values.description !== undefined && values.description.length > 0) {
    payload.description = values.description
  }
  if (values.status !== undefined) {
    payload.status = values.status
  }
  if (values.priority !== undefined) {
    payload.priority = values.priority
  }
  if (values.scheduledDate) {
    payload.scheduledDate = values.scheduledDate
  }
  if (values.estimate !== undefined && values.estimate !== null) {
    payload.estimate = values.estimate
  }
  if (values.labels !== undefined && values.labels.length > 0) {
    payload.labels = values.labels
  }
  if (values.templateId) {
    payload.templateId = values.templateId
  }
  if (values.workspaceProjectId) {
    payload.workspaceProjectId = values.workspaceProjectId
  }
  if (values.workspaceName?.trim()) {
    payload.workspaceName = values.workspaceName.trim()
  }
  if (values.preferredAgent) {
    payload.preferredAgent = values.preferredAgent
  }
  return payload
}

type TodoCreateDialogProps = {
  projectId: string
  initialStatus?: TodoStatus
  onClose: () => void
}

export function TodoCreateDialog({
  projectId,
  initialStatus,
  onClose
}: TodoCreateDialogProps): React.JSX.Element {
  const createTodoItem = useAppStore((s) => s.createTodoItem)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [status, setStatus] = React.useState<TodoStatus>(initialStatus ?? 'backlog')
  const [priority, setPriority] = React.useState<TodoPriority>('none')
  const [scheduledDate, setScheduledDate] = React.useState('')
  const [templateId, setTemplateId] = React.useState<string | null>(null)
  const [workspaceFields, setWorkspaceFields] = React.useState<TodoCreateWorkspaceFieldsValue>(
    () => ({
      workspaceProjectId: null,
      workspaceName: '',
      preferredAgent: ACP_ENGINES[0]
    })
  )

  const canSubmit = title.trim().length > 0

  // Keep the dialog open and preserve entered values if the IPC call rejects,
  // so a transient failure never silently discards the user's input.
  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    try {
      await createTodoItem(
        buildCreateTodoPayload({
          projectId,
          title,
          description,
          status,
          priority,
          scheduledDate,
          templateId,
          workspaceProjectId: workspaceFields.workspaceProjectId,
          workspaceName: workspaceFields.workspaceName,
          preferredAgent: workspaceFields.preferredAgent
        })
      )
      onClose()
    } catch (error) {
      console.error('[TodoCreateDialog] createTodoItem failed', error)
      toast.error(
        translate('auto.components.todo.TodoCreateDialog.createError', 'Failed to create task')
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.todo.TodoCreateDialog.title', 'New task')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="todo-create-title">
              {translate('auto.components.todo.TodoCreateDialog.titleLabel', 'Title')}
            </Label>
            <Input
              id="todo-create-title"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder={translate(
                'auto.components.todo.TodoCreateDialog.titlePlaceholder',
                'What needs to be done?'
              )}
            />
          </div>

          <TodoCreateWorkspaceFields value={workspaceFields} onChange={setWorkspaceFields} />

          <div className="flex flex-col gap-1.5">
            <Label>
              {translate('auto.components.todo.TodoCreateDialog.templateLabel', 'Template')}
            </Label>
            <TodoTemplatePicker
              value={templateId}
              onSelect={(template) => {
                setTemplateId(template?.id ?? null)
                // Prefill the description from the template body for a quick start.
                if (template) {
                  setDescription(template.body)
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="todo-create-description">
              {translate('auto.components.todo.TodoCreateDialog.descriptionLabel', 'Description')}
            </Label>
            <textarea
              id="todo-create-description"
              className={cn(TEXTAREA_CLASS, 'min-h-28')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={translate(
                'auto.components.todo.TodoCreateDialog.descriptionPlaceholder',
                'Add more detail (Markdown supported)'
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="todo-create-status">
                {translate('auto.components.todo.TodoCreateDialog.statusLabel', 'Status')}
              </Label>
              <select
                id="todo-create-status"
                className={SELECT_CLASS}
                value={status}
                onChange={(e) => setStatus(e.target.value as TodoStatus)}
              >
                {TODO_STATUS_CATALOG.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {translate(meta.labelKey, meta.fallbackLabel)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="todo-create-priority">
                {translate('auto.components.todo.TodoCreateDialog.priorityLabel', 'Priority')}
              </Label>
              <select
                id="todo-create-priority"
                className={SELECT_CLASS}
                value={priority}
                onChange={(e) => setPriority(e.target.value as TodoPriority)}
              >
                {TODO_PRIORITY_CATALOG.map((meta) => (
                  <option key={meta.id} value={meta.id}>
                    {translate(meta.labelKey, meta.fallbackLabel)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="todo-create-date">
                {translate('auto.components.todo.TodoCreateDialog.scheduledLabel', 'Scheduled')}
              </Label>
              <Input
                id="todo-create-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {translate('auto.components.todo.TodoCreateDialog.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={() => {
              void handleSubmit()
            }}
            disabled={!canSubmit}
          >
            {translate('auto.components.todo.TodoCreateDialog.create', 'Create task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
