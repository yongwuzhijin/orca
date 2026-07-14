import React from 'react'
import { FolderPlus } from 'lucide-react'
import ProjectCombobox from '@/components/new-workspace/ProjectCombobox'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getComposerEligibleRepos } from '@/lib/new-workspace-composer-repo'
import { buildNewWorkspaceCreateTargetOptions } from '@/lib/new-workspace-project-options'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { buildExecutionHostRegistry } from '../../../../shared/execution-host-registry'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import type { ProjectHostSetup } from '../../../../shared/types'

export function resolveWorkspaceProjectCwd(
  workspaceProjectId: string | null,
  projectHostSetups: readonly ProjectHostSetup[],
  fallbackCwd?: string | null
): string {
  if (workspaceProjectId) {
    const ready = projectHostSetups.find(
      (setup) => setup.projectId === workspaceProjectId && setup.setupState === 'ready'
    )
    if (ready?.path) {
      return ready.path
    }
  }
  return fallbackCwd?.trim() ?? ''
}

type TodoWorkspaceProjectPickerProps = {
  value: string | null
  onChange: (projectId: string) => void
  /** Override the field label — defaults to the shared "Project" string. */
  label?: string
}

/** Shared project picker used by New Task and Start Session. */
export function TodoWorkspaceProjectPicker({
  value,
  onChange,
  label
}: TodoWorkspaceProjectPickerProps): React.JSX.Element {
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
      <ProjectCombobox
        options={projectOptions}
        value={value}
        onValueChange={onChange}
        placeholder={translate(
          'auto.components.NewWorkspaceComposerCard.dccd26d4e4',
          'Choose project'
        )}
        triggerClassName="h-9 w-full border-input text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
      />
    </div>
  )
}
