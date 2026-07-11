import React from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { TodoTemplate } from '../../../../shared/todo/todo-template'

const TEXTAREA_CLASS =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/60'

type TodoTemplateManagerDialogProps = {
  onClose: () => void
}

export function TodoTemplateManagerDialog({
  onClose
}: TodoTemplateManagerDialogProps): React.JSX.Element {
  const templates = useAppStore((s) => s.todoTemplates)
  const createTodoTemplate = useAppStore((s) => s.createTodoTemplate)
  const updateTodoTemplate = useAppStore((s) => s.updateTodoTemplate)
  const deleteTodoTemplate = useAppStore((s) => s.deleteTodoTemplate)

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [body, setBody] = React.useState('')
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)

  const resetForm = (): void => {
    setEditingId(null)
    setName('')
    setBody('')
  }

  const startEdit = (template: TodoTemplate): void => {
    setEditingId(template.id)
    setName(template.name)
    setBody(template.body)
  }

  // Only clear the form after the IPC call resolves; on rejection we keep the
  // draft so the user can retry without re-typing.
  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      return
    }
    try {
      await (editingId
        ? updateTodoTemplate({ id: editingId, name: trimmedName, body })
        : createTodoTemplate({ name: trimmedName, body }))
      resetForm()
    } catch {
      toast.error(
        translate(
          'auto.components.todo.TodoTemplateManagerDialog.saveError',
          'Failed to save template'
        )
      )
    }
  }

  // Preserve the confirm/edit state on failure so the delete can be retried.
  const handleDelete = async (templateId: string): Promise<void> => {
    try {
      await deleteTodoTemplate(templateId)
      if (editingId === templateId) {
        resetForm()
      }
      setConfirmDeleteId(null)
    } catch {
      toast.error(
        translate(
          'auto.components.todo.TodoTemplateManagerDialog.deleteError',
          'Failed to delete template'
        )
      )
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.todo.TodoTemplateManagerDialog.title', 'Manage templates')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.todo.TodoTemplateManagerDialog.description',
              'Reusable descriptions applied when creating a task.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {translate('auto.components.todo.TodoTemplateManagerDialog.existing', 'Templates')}
          </span>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto scrollbar-sleek">
            {templates.length === 0 ? (
              <span className="px-1 py-2 text-sm text-muted-foreground">
                {translate(
                  'auto.components.todo.TodoTemplateManagerDialog.empty',
                  'No templates yet'
                )}
              </span>
            ) : (
              templates.map((template) => (
                <div
                  key={template.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-border px-2 py-1.5',
                    editingId === template.id && 'border-ring'
                  )}
                >
                  <span className="flex-1 truncate text-sm">{template.name}</span>
                  {confirmDeleteId === template.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          void handleDelete(template.id)
                        }}
                      >
                        {translate(
                          'auto.components.todo.TodoTemplateManagerDialog.confirmDelete',
                          'Delete'
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                        {translate(
                          'auto.components.todo.TodoTemplateManagerDialog.cancel',
                          'Cancel'
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={translate(
                          'auto.components.todo.TodoTemplateManagerDialog.edit',
                          'Edit template'
                        )}
                        onClick={() => startEdit(template)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={translate(
                          'auto.components.todo.TodoTemplateManagerDialog.delete',
                          'Delete template'
                        )}
                        onClick={() => setConfirmDeleteId(template.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Label htmlFor="todo-template-name">
            {editingId
              ? translate(
                  'auto.components.todo.TodoTemplateManagerDialog.editHeading',
                  'Edit template'
                )
              : translate(
                  'auto.components.todo.TodoTemplateManagerDialog.newHeading',
                  'New template'
                )}
          </Label>
          <Input
            id="todo-template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={translate(
              'auto.components.todo.TodoTemplateManagerDialog.namePlaceholder',
              'Template name'
            )}
          />
          <textarea
            className={cn(TEXTAREA_CLASS, 'min-h-24')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={translate(
              'auto.components.todo.TodoTemplateManagerDialog.bodyPlaceholder',
              'Template body (Markdown)'
            )}
          />
          <div className="flex justify-end gap-2">
            {editingId ? (
              <Button variant="ghost" onClick={resetForm}>
                {translate('auto.components.todo.TodoTemplateManagerDialog.cancelEdit', 'Cancel')}
              </Button>
            ) : null}
            <Button
              onClick={() => {
                void handleSave()
              }}
              disabled={name.trim().length === 0}
            >
              {editingId ? (
                translate('auto.components.todo.TodoTemplateManagerDialog.save', 'Save')
              ) : (
                <>
                  <Plus className="size-4" />
                  {translate(
                    'auto.components.todo.TodoTemplateManagerDialog.create',
                    'Add template'
                  )}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
