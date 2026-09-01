import React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { translate } from '@/i18n/i18n'
import type {
  TodoExecutionMode,
  TodoAcpEngine
} from '../../../../../shared/todo/todo-execution-mode'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import type { AgentCatalogEntry } from '@/lib/agent-catalog'
import type { TodoTemplate } from '../../../../../shared/todo/todo-template'
import { TodoTemplatePicker } from '../todo-template-picker'
import { ACP_ENGINE_LABELS, ENTER_DIALOG_SELECT_CLASS } from './enter-in-progress-dialog-agents'

export type EnterInProgressDialogFieldsProps = {
  mode: 'todo' | 'from-design'
  hasBoundProject: boolean
  executionMode: TodoExecutionMode
  onExecutionModeChange: (mode: TodoExecutionMode) => void
  acpEngine: TodoAcpEngine | null
  onAcpEngineChange: (engine: TodoAcpEngine) => void
  visibleAcpEngines: readonly TodoAcpEngine[]
  terminalAgent: TuiAgent | null
  onTerminalAgentChange: (agent: TuiAgent | null) => void
  visibleTerminalAgents: readonly AgentCatalogEntry[]
  templateId: string | null
  onTemplateSelect: (template: TodoTemplate | null) => void
  base: string
  extra: string
  onExtraChange: (value: string) => void
  autoPilotOn: boolean
  onAutoPilotChange: (on: boolean) => void
  maxTurns: number
  onMaxTurnsChange: (turns: number) => void
  designStage: boolean
  designStageAvailable: boolean
  onDesignStageChange: (on: boolean) => void
  starting: boolean
  canStart: boolean
  onCancel: () => void
  onStart: () => void
}

export function EnterInProgressDialogFields({
  mode,
  hasBoundProject,
  executionMode,
  onExecutionModeChange,
  acpEngine,
  onAcpEngineChange,
  visibleAcpEngines,
  terminalAgent,
  onTerminalAgentChange,
  visibleTerminalAgents,
  templateId,
  onTemplateSelect,
  base,
  extra,
  onExtraChange,
  autoPilotOn,
  onAutoPilotChange,
  maxTurns,
  onMaxTurnsChange,
  designStage,
  designStageAvailable,
  onDesignStageChange,
  starting,
  canStart,
  onCancel,
  onStart
}: EnterInProgressDialogFieldsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        {translate('auto.components.todo.detail.EnterInProgressDialog.title', 'Start task')}
      </h2>

      {!hasBoundProject ? (
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.todo.detail.EnterInProgressDialog.noBoundProject',
            'Bind a project on this requirement before starting.'
          )}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label>
          {translate(
            'auto.components.todo.detail.EnterInProgressDialog.executionMode',
            'Execution mode'
          )}
        </Label>
        <ToggleGroup
          type="single"
          value={executionMode}
          onValueChange={(value) => {
            if (value === 'acp' || value === 'terminal') {
              onExecutionModeChange(value)
            }
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="acp" className="px-3 text-xs">
            {translate('auto.components.todo.detail.EnterInProgressDialog.acpMode', 'ACP')}
          </ToggleGroupItem>
          <ToggleGroupItem value="terminal" className="px-3 text-xs">
            {translate(
              'auto.components.todo.detail.EnterInProgressDialog.terminalMode',
              'Terminal'
            )}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {executionMode === 'acp' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enter-engine">
            {translate('auto.components.todo.detail.EnterInProgressDialog.engine', 'Agent')}
          </Label>
          <select
            id="enter-engine"
            className={ENTER_DIALOG_SELECT_CLASS}
            value={acpEngine ?? ''}
            disabled={visibleAcpEngines.length === 0}
            onChange={(e) => onAcpEngineChange(e.target.value as TodoAcpEngine)}
          >
            {visibleAcpEngines.length === 0 ? (
              <option value="">
                {translate(
                  'auto.components.todo.detail.EnterInProgressDialog.noInstalledAcpAgents',
                  'No installed ACP agents (Cursor / Qoder)'
                )}
              </option>
            ) : (
              visibleAcpEngines.map((engine) => (
                <option key={engine} value={engine}>
                  {ACP_ENGINE_LABELS[engine]}
                </option>
              ))
            )}
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>
            {translate('auto.components.todo.detail.EnterInProgressDialog.engine', 'Agent')}
          </Label>
          <AgentCombobox
            agents={[...visibleTerminalAgents]}
            value={terminalAgent}
            onValueChange={onTerminalAgentChange}
            allowBlankTerminal={false}
            allowNarrowTrigger
            emptyLabel={translate(
              'auto.components.todo.detail.EnterInProgressDialog.noInstalledAgents',
              'No installed agents'
            )}
            triggerClassName="h-9 w-full min-w-0 border-input text-sm focus:border-ring focus:ring-[3px] focus:ring-ring/50"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>
          {translate('auto.components.todo.TodoCreateDialog.templateLabel', 'Template')}
        </Label>
        <TodoTemplatePicker
          value={templateId}
          onSelect={(template) => onTemplateSelect(template ?? null)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          {translate('auto.components.todo.detail.EnterInProgressDialog.basePrompt', 'Base prompt')}
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
          onChange={(e) => onExtraChange(e.target.value)}
        />
      </div>

      {executionMode === 'acp' ? (
        <div className="flex items-center gap-3">
          <input
            id="enter-autopilot"
            type="checkbox"
            className="size-4"
            checked={autoPilotOn}
            onChange={(e) => onAutoPilotChange(e.target.checked)}
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
                onChange={(e) => onMaxTurnsChange(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === 'from-design' ? null : (
        <div className="flex items-center gap-3">
          <input
            id="enter-design-stage"
            type="checkbox"
            className="size-4"
            checked={designStage && designStageAvailable}
            disabled={!designStageAvailable}
            aria-describedby={designStageAvailable ? undefined : 'enter-design-stage-hint'}
            onChange={(e) => onDesignStageChange(e.target.checked)}
          />
          <Label htmlFor="enter-design-stage" className="cursor-pointer">
            {translate(
              'auto.components.todo.detail.EnterInProgressDialog.designStage',
              'Design the solution first'
            )}
          </Label>
          {designStageAvailable ? null : (
            <span id="enter-design-stage-hint" className="text-xs text-muted-foreground">
              {translate(
                'auto.components.todo.detail.EnterInProgressDialog.designStageUnset',
                'Set a solution design skill in Settings to enable this stage'
              )}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={starting}>
          {translate('auto.components.todo.detail.EnterInProgressDialog.cancel', 'Cancel')}
        </Button>
        <Button size="sm" disabled={!canStart} onClick={onStart}>
          {starting
            ? translate('auto.components.todo.detail.EnterInProgressDialog.starting', 'Starting…')
            : translate('auto.components.todo.detail.EnterInProgressDialog.start', 'Start')}
        </Button>
      </div>
    </div>
  )
}
