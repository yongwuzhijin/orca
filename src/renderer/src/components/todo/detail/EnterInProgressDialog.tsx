import React from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { isTuiAgentEnabled, pickTuiAgent } from '../../../../../shared/tui-agent-selection'
import { useAppStore } from '@/store'
import { EMPTY_DISABLED_TUI_AGENTS } from '@/components/settings/shortcut-groups'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { TodoStatus } from '../../../../../shared/todo/todo-status'
import type {
  TodoExecutionMode,
  TodoAcpEngine
} from '../../../../../shared/todo/todo-execution-mode'
import { TODO_ACP_ENGINES } from '../../../../../shared/todo/todo-execution-mode'
import { resolveTodoStartRepo } from '../../../../../shared/todo/resolve-todo-start-repo'
import type { TuiAgent } from '../../../../../shared/tui-agent'

import { buildBasePrompt, composePrompt } from '../../../../../shared/todo/todo-base-prompt'
import {
  buildDesignHandoffPrompt,
  buildDesignStagePrompt,
  isDesignStageSkillConfigured
} from '../../../../../shared/todo/todo-design-prompt'
import { DEFAULT_TODO_DESIGN_STAGE_SKILL } from '../../../../../shared/constants'
import { resolveWorkspaceOrcaDirName } from '../../../../../shared/orca-dir-names'
import { parseTodoTerminalAgent, startTodoViaTerminal } from './todo-terminal-task-start'
import { startTodoWorkspace } from './todo-start-workspace'
import { resolveAcpEngine, resolveInitialExecutionMode } from './enter-in-progress-dialog-agents'
import { EnterInProgressDialogFields } from './EnterInProgressDialogFields'

export { buildBasePrompt, composePrompt }

type EnterInProgressDialogProps = {
  item: TodoItem
  onClose: () => void
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
  const disabledTuiAgents = useAppStore(
    (s) => s.settings?.disabledTuiAgents ?? EMPTY_DISABLED_TUI_AGENTS
  )
  const defaultTuiAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const designStageSkill = useAppStore(
    (s) => s.settings?.todoDesignStageSkill ?? DEFAULT_TODO_DESIGN_STAGE_SKILL
  )
  const orcaDirName = useAppStore((s) => resolveWorkspaceOrcaDirName(s.settings))

  const { detectedIds } = useDetectedAgents({ kind: 'local' })
  const installedAgentIds = React.useMemo(
    () => (detectedIds === null ? null : new Set(detectedIds)),
    [detectedIds]
  )

  const agentCatalog = React.useMemo(() => getAgentCatalog(), [])
  const visibleTerminalAgents = React.useMemo(() => {
    if (installedAgentIds === null) {
      return []
    }
    return agentCatalog.filter(
      (agent) => installedAgentIds.has(agent.id) && isTuiAgentEnabled(agent.id, disabledTuiAgents)
    )
  }, [agentCatalog, disabledTuiAgents, installedAgentIds])

  const visibleAcpEngines = React.useMemo(() => {
    if (installedAgentIds === null) {
      return [...TODO_ACP_ENGINES]
    }
    return TODO_ACP_ENGINES.filter((engine) => installedAgentIds.has(engine))
  }, [installedAgentIds])

  const [executionMode, setExecutionMode] = React.useState<TodoExecutionMode>(() =>
    resolveInitialExecutionMode(item)
  )
  const [acpEngine, setAcpEngine] = React.useState<TodoAcpEngine | null>(() =>
    resolveAcpEngine(item.preferredAgent, null)
  )
  const [terminalAgent, setTerminalAgent] = React.useState<TuiAgent | null>(null)
  const [templateId, setTemplateId] = React.useState<string | null>(() => item.templateId)
  const [extra, setExtra] = React.useState('')
  const [autoPilotOn, setAutoPilotOn] = React.useState(true)
  const [maxTurns, setMaxTurns] = React.useState(10)
  const [designStage, setDesignStage] = React.useState(item.designStageEnabled)
  const [starting, setStarting] = React.useState(false)

  React.useEffect(() => {
    setAcpEngine((current) => resolveAcpEngine(current ?? item.preferredAgent, installedAgentIds))
  }, [installedAgentIds, item.preferredAgent])

  React.useEffect(() => {
    if (installedAgentIds === null) {
      return
    }
    setTerminalAgent((current) => {
      if (
        current &&
        installedAgentIds.has(current) &&
        isTuiAgentEnabled(current, disabledTuiAgents)
      ) {
        return current
      }
      return pickTuiAgent(
        parseTodoTerminalAgent(item.preferredAgent) ?? defaultTuiAgent,
        installedAgentIds,
        disabledTuiAgents
      )
    })
  }, [defaultTuiAgent, disabledTuiAgents, installedAgentIds, item.preferredAgent])

  const hasBoundProject = Boolean(
    resolveTodoStartRepo({
      workspaceProjectId: item.workspaceProjectId,
      projectHostSetups
    })
  )
  const designStageAvailable = isDesignStageSkillConfigured(designStageSkill)
  const useDesignStage = mode !== 'from-design' && designStage && designStageAvailable
  const base =
    mode === 'from-design'
      ? buildDesignHandoffPrompt(item, designDocNames ?? [], orcaDirName)
      : useDesignStage
        ? buildDesignStagePrompt(item, designStageSkill, orcaDirName)
        : buildBasePrompt(item)
  const prompt = composePrompt(base, extra)
  const canStart =
    !starting &&
    hasBoundProject &&
    (executionMode === 'acp'
      ? acpEngine !== null
      : terminalAgent !== null && visibleTerminalAgents.length > 0)

  const confirm = async (): Promise<void> => {
    if (!canStart) {
      return
    }
    const preferredAgent = executionMode === 'acp' ? acpEngine : terminalAgent
    if (!preferredAgent) {
      return
    }

    setStarting(true)
    try {
      const workspace = await startTodoWorkspace(item)
      if (!workspace.ok) {
        toast.error(workspace.message)
        return
      }

      const nextStatus: TodoStatus = useDesignStage ? 'solution_design' : 'in_progress'
      await updateTodoItem(
        item.id,
        mode === 'from-design'
          ? {
              status: nextStatus,
              templateId,
              executionMode,
              preferredAgent,
              boundWorktreeId: workspace.worktreeId
            }
          : {
              status: nextStatus,
              designStageEnabled: useDesignStage,
              templateId,
              executionMode,
              preferredAgent,
              boundWorktreeId: workspace.worktreeId
            }
      )

      if (executionMode === 'terminal') {
        const started = await startTodoViaTerminal({
          agent: preferredAgent as TuiAgent,
          worktreeId: workspace.worktreeId,
          prompt
        })
        if (started) {
          openTodoDetail(item.id)
          onClose()
        }
        return
      }

      await executeTask({
        taskId: item.id,
        engine: preferredAgent as TodoAcpEngine,
        prompt,
        cwd: workspace.path,
        autoPilot: autoPilotOn ? { maxTurns } : undefined
      })
      openTodoDetail(item.id)
      onClose()
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <EnterInProgressDialogFields
          mode={mode}
          hasBoundProject={hasBoundProject}
          executionMode={executionMode}
          onExecutionModeChange={setExecutionMode}
          acpEngine={acpEngine}
          onAcpEngineChange={setAcpEngine}
          visibleAcpEngines={visibleAcpEngines}
          terminalAgent={terminalAgent}
          onTerminalAgentChange={setTerminalAgent}
          visibleTerminalAgents={visibleTerminalAgents}
          templateId={templateId}
          onTemplateSelect={(template) => {
            setTemplateId(template?.id ?? null)
            if (template) {
              setExtra(template.body)
            }
          }}
          base={base}
          extra={extra}
          onExtraChange={setExtra}
          autoPilotOn={autoPilotOn}
          onAutoPilotChange={setAutoPilotOn}
          maxTurns={maxTurns}
          onMaxTurnsChange={setMaxTurns}
          designStage={designStage}
          designStageAvailable={designStageAvailable}
          onDesignStageChange={setDesignStage}
          starting={starting}
          canStart={canStart}
          onCancel={onClose}
          onStart={() => void confirm()}
        />
      </DialogContent>
    </Dialog>
  )
}
