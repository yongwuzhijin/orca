import React from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

const TEXTAREA_CLASS =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 placeholder:text-muted-foreground/60'

type TemplateRecord = {
  id: string
  name: string
  body: string
}

type RequirementTemplateListEditorProps = {
  templates: TemplateRecord[]
  onCreate: (input: { name: string; body: string }) => Promise<void>
  onUpdate: (input: { id: string; name: string; body: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  emptyLabel: string
}

export function RequirementTemplateListEditor({
  templates,
  onCreate,
  onUpdate,
  onDelete,
  emptyLabel
}: RequirementTemplateListEditorProps): React.JSX.Element {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [body, setBody] = React.useState('')

  const resetForm = (): void => {
    setEditingId(null)
    setName('')
    setBody('')
  }

  const startEdit = (template: TemplateRecord): void => {
    setEditingId(template.id)
    setName(template.name)
    setBody(template.body)
  }

  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      return
    }
    try {
      await (editingId
        ? onUpdate({ id: editingId, name: trimmedName, body })
        : onCreate({ name: trimmedName, body }))
      resetForm()
    } catch {
      toast.error(
        translate(
          'auto.components.settings.RequirementTemplateListEditor.saveError',
          'Failed to save template'
        )
      )
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            {translate(
              'auto.components.settings.RequirementTemplateListEditor.listTitle',
              'Templates'
            )}
          </h3>
          <Button size="sm" variant="outline" onClick={resetForm}>
            <Plus className="size-3.5" />
            {translate('auto.components.settings.RequirementTemplateListEditor.new', 'New')}
          </Button>
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
                    editingId === template.id ? 'border-ring bg-muted/40' : 'border-border'
                  )}
                  onClick={() => startEdit(template)}
                >
                  <span className="truncate">{template.name}</span>
                  <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="requirement-template-name">
            {translate('auto.components.settings.RequirementTemplateListEditor.name', 'Name')}
          </Label>
          <Input
            id="requirement-template-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="requirement-template-body">
            {translate(
              'auto.components.settings.RequirementTemplateListEditor.body',
              'Prompt body'
            )}
          </Label>
          <textarea
            id="requirement-template-body"
            className={cn(TEXTAREA_CLASS, 'min-h-48')}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          {editingId ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void onDelete(editingId).then(resetForm)
              }}
            >
              <Trash2 className="size-3.5" />
              {translate('auto.components.settings.RequirementTemplateListEditor.delete', 'Delete')}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => void handleSave()} disabled={name.trim().length === 0}>
            {translate('auto.components.settings.RequirementTemplateListEditor.save', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
