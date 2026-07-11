import React from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoProject } from '../../../../shared/todo/todo-project'

const PREFIX_PATTERN = /^[A-Za-z0-9]{1,10}$/

export function TodoProjectSwitcher(): React.JSX.Element {
  const projects = useAppStore((s) => s.todoProjects)
  const activeProjectId = useAppStore((s) => s.todoActiveProjectId)
  const setActiveTodoProject = useAppStore((s) => s.setActiveTodoProject)
  const createTodoProject = useAppStore((s) => s.createTodoProject)
  const deleteTodoProject = useAppStore((s) => s.deleteTodoProject)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<TodoProject | null>(null)

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const activeName =
    activeProject?.name ??
    translate('auto.components.todo.TodoProjectSwitcher.noProject', 'No project')

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <span className="max-w-40 truncate">{activeName}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>
            {translate('auto.components.todo.TodoProjectSwitcher.projects', 'Projects')}
          </DropdownMenuLabel>
          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => void setActiveTodoProject(project.id)}
              className="flex items-center gap-2"
            >
              <span className="flex-1 truncate">{project.name}</span>
              <span className="text-xs text-muted-foreground">{project.identifierPrefix}</span>
              <button
                type="button"
                aria-label={translate(
                  'auto.components.todo.TodoProjectSwitcher.deleteProject',
                  'Delete project'
                )}
                className="text-muted-foreground hover:text-destructive"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setDeleteTarget(project)
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </DropdownMenuItem>
          ))}
          {projects.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" />
            {translate('auto.components.todo.TodoProjectSwitcher.newProject', 'New project')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TodoProjectCreateForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(input) => createTodoProject(input)}
      />

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {translate('auto.components.todo.TodoProjectSwitcher.deleteTitle', 'Delete project?')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.todo.TodoProjectSwitcher.deleteWarning',
                'Deleting this project permanently removes it and all of its tasks. This cannot be undone.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              {translate('auto.components.todo.TodoProjectSwitcher.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  void deleteTodoProject(deleteTarget.id)
                }
                setDeleteTarget(null)
              }}
            >
              {translate('auto.components.todo.TodoProjectSwitcher.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TodoProjectCreateForm({
  open,
  onOpenChange,
  onCreate
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; identifierPrefix: string }) => Promise<unknown>
}): React.JSX.Element {
  const nameId = React.useId()
  const prefixId = React.useId()
  const [name, setName] = React.useState('')
  const [prefix, setPrefix] = React.useState('')

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && PREFIX_PATTERN.test(prefix)

  const reset = (): void => {
    setName('')
    setPrefix('')
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      reset()
    }
    onOpenChange(nextOpen)
  }

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    await onCreate({ name: trimmedName, identifierPrefix: prefix })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.todo.TodoProjectSwitcher.newProject', 'New project')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.todo.TodoProjectSwitcher.newProjectDescription',
              'Name the project and pick a short identifier prefix for its tasks.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSubmit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={nameId} className="text-xs">
              {translate('auto.components.todo.TodoProjectSwitcher.nameLabel', 'Name')}
            </Label>
            <Input
              id={nameId}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={prefixId} className="text-xs">
              {translate(
                'auto.components.todo.TodoProjectSwitcher.prefixLabel',
                'Identifier prefix'
              )}
            </Label>
            <Input
              id={prefixId}
              value={prefix}
              maxLength={10}
              placeholder={translate(
                'auto.components.todo.TodoProjectSwitcher.prefixPlaceholder',
                'ENG'
              )}
              onChange={(event) => setPrefix(event.target.value)}
              aria-invalid={prefix.length > 0 && !PREFIX_PATTERN.test(prefix)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {translate('auto.components.todo.TodoProjectSwitcher.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {translate('auto.components.todo.TodoProjectSwitcher.create', 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
