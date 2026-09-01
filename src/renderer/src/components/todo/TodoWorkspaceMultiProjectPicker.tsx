import React from 'react'
import { FolderPlus, X } from 'lucide-react'
import ProjectCombobox from '@/components/new-workspace/ProjectCombobox'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getComposerEligibleRepos } from '@/lib/new-workspace-composer-repo'
import { buildNewWorkspaceCreateTargetOptions } from '@/lib/new-workspace-project-options'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { buildExecutionHostRegistry } from '../../../../shared/execution-host-registry'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import type { NewWorkspaceProjectOption } from '@/lib/new-workspace-project-options'

type TodoWorkspaceMultiProjectPickerProps = {
  values: string[]
  onChange: (projectIds: string[]) => void
  label?: string
}

function optionLabel(options: readonly NewWorkspaceProjectOption[], projectId: string): string {
  return options.find((option) => option.id === projectId)?.displayName ?? projectId
}

/** Multi-select project picker for New Task — reuses ProjectCombobox to add projects. */
export function TodoWorkspaceMultiProjectPicker({
  values,
  onChange,
  label
}: TodoWorkspaceMultiProjectPickerProps): React.JSX.Element {
  const repos = useAppStore((s) => s.repos)
  const projects = useAppStore((s) => s.projects)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const settings = useAppStore((s) => s.settings)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const addRepo = useAppStore((s) => s.addRepo)
  const [pickerValue, setPickerValue] = React.useState<string | null>(null)

  const eligibleRepos = React.useMemo(() => getComposerEligibleRepos(repos), [repos])
  const hostOptions = React.useMemo(
    () =>
      buildExecutionHostRegistry({
        repos,
        settings,
        sshTargetLabels,
        sshConnectionStates,
        runtimeEnvironments,
        runtimeStatusByEnvironmentId,
        hostLabelOverrides: getHostDisplayLabelOverrides(settings)
      }),
    [
      repos,
      runtimeEnvironments,
      runtimeStatusByEnvironmentId,
      settings,
      sshConnectionStates,
      sshTargetLabels
    ]
  )
  const projectOptions = React.useMemo(
    () =>
      buildNewWorkspaceCreateTargetOptions({
        projects,
        projectHostSetups,
        eligibleRepos,
        projectGroups,
        hosts: hostOptions
      }),
    [eligibleRepos, hostOptions, projectGroups, projectHostSetups, projects]
  )
  const availableOptions = React.useMemo(
    () => projectOptions.filter((option) => !values.includes(option.id)),
    [projectOptions, values]
  )

  const addProject = (projectId: string): void => {
    if (!projectId || values.includes(projectId)) {
      return
    }
    onChange([...values, projectId])
    setPickerValue(null)
  }

  const removeProject = (projectId: string): void => {
    onChange(values.filter((id) => id !== projectId))
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          {label ?? translate('auto.components.NewWorkspaceComposerCard.969a8bff66', 'Project')}
        </label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void addRepo()}
              className="size-5 shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={translate(
                'auto.components.NewWorkspaceComposerCard.d6b0a96f32',
                'Add project'
              )}
            >
              <FolderPlus className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {translate('auto.components.NewWorkspaceComposerCard.d6b0a96f32', 'Add project')}
          </TooltipContent>
        </Tooltip>
      </div>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((projectId) => (
            <span
              key={projectId}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
            >
              <span className="truncate">{optionLabel(projectOptions, projectId)}</span>
              <button
                type="button"
                className="rounded-sm text-muted-foreground hover:text-foreground"
                aria-label={translate(
                  'auto.components.todo.TodoWorkspaceMultiProjectPicker.removeProject',
                  'Remove project'
                )}
                onClick={() => removeProject(projectId)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <ProjectCombobox
        options={availableOptions}
        value={pickerValue}
        onValueChange={addProject}
        placeholder={translate(
          'auto.components.todo.TodoWorkspaceMultiProjectPicker.addProjectPlaceholder',
          'Add project to task'
        )}
        triggerClassName="h-9 w-full border-input text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
      />
    </div>
  )
}
