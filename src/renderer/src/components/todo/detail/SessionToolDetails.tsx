import React from 'react'
import { Check, CircleAlert, CircleMinus, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { translate } from '@/i18n/i18n'
import type { SessionEvent } from '../../../../../shared/acp/session-event'
import {
  presentAcpToolCall,
  type AcpDiffLine,
  type AcpToolPresentation
} from './acp-tool-presentation'
import { SessionDisclosure } from './SessionDisclosure'

type ToolCallEvent = Extract<SessionEvent, { kind: 'tool_call' }>

type SessionToolDetailsProps = {
  event: ToolCallEvent
}

const RUNNING_STATUSES = new Set(['pending', 'running', 'in_progress'])
const SUCCESS_STATUSES = new Set(['completed', 'success', 'succeeded'])
const ERROR_STATUSES = new Set(['error', 'failed', 'failure'])

function diffLineClass(kind: AcpDiffLine['kind']): string {
  if (kind === 'add') {
    return 'text-(--git-decoration-added)'
  }
  if (kind === 'del') {
    return 'text-(--git-decoration-deleted)'
  }
  return ''
}

function FileDetail({
  presentation
}: {
  presentation: Extract<AcpToolPresentation, { kind: 'file' }>
}): React.JSX.Element {
  return (
    <div className="mt-1 max-h-64 min-w-0 max-w-full overflow-auto rounded-md bg-accent font-mono text-xs scrollbar-sleek">
      {presentation.lines.map((line, index) => (
        <div
          key={`${index}-${line.text}`}
          className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 px-2 py-0.5 ${diffLineClass(line.kind)}`}
        >
          <span className="select-none text-right text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {line.text}
          </span>
        </div>
      ))}
    </div>
  )
}

function CommandDetail({
  presentation
}: {
  presentation: Extract<AcpToolPresentation, { kind: 'command' }>
}): React.JSX.Element {
  return (
    <div className="mt-1 max-h-48 min-w-0 max-w-full overflow-auto rounded-md bg-accent font-mono text-xs scrollbar-sleek">
      {presentation.command ? (
        <div className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] px-2 py-1">
          {presentation.command}
        </div>
      ) : null}
      {presentation.output ? (
        <pre
          aria-label={translate(
            'auto.components.todo.detail.session-event-item.commandOutput',
            'Command output'
          )}
          className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-t border-border px-2 py-1 text-muted-foreground"
        >
          {presentation.output}
        </pre>
      ) : null}
    </div>
  )
}

function SubagentTitle({
  presentation,
  status
}: {
  presentation: Extract<AcpToolPresentation, { kind: 'subagent' }>
  status?: string
}): React.JSX.Element {
  const normalizedStatus = status?.toLowerCase() ?? ''
  const running = RUNNING_STATUSES.has(normalizedStatus)
  const successful = SUCCESS_STATUSES.has(normalizedStatus)
  const failed = ERROR_STATUSES.has(normalizedStatus)

  return (
    <span className="flex min-w-0 items-start gap-1.5">
      {running ? (
        <Loader2
          aria-hidden="true"
          className="mt-0.5 size-3 shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : successful ? (
        <Check
          aria-hidden="true"
          data-testid="subagent-success-state"
          className="mt-0.5 size-3 shrink-0"
        />
      ) : failed ? (
        <CircleAlert
          aria-hidden="true"
          data-testid="subagent-error-state"
          className="mt-0.5 size-3 shrink-0 text-destructive"
        />
      ) : (
        <CircleMinus
          aria-hidden="true"
          data-testid="subagent-neutral-state"
          className="mt-0.5 size-3 shrink-0"
        />
      )}
      <span className="min-w-0">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-foreground">{presentation.title}</span>
          {presentation.model ? (
            <span className="shrink-0 text-muted-foreground">{presentation.model}</span>
          ) : null}
        </span>
        {presentation.stage ? (
          <span className="block truncate text-muted-foreground">{presentation.stage}</span>
        ) : null}
      </span>
    </span>
  )
}

function formatToolStatus(status: string): string {
  const normalizedStatus = status.toLowerCase()
  if (normalizedStatus === 'pending') {
    return translate('auto.components.todo.detail.session-event-item.statusPending', 'Pending')
  }
  if (normalizedStatus === 'running' || normalizedStatus === 'in_progress') {
    return translate('auto.components.todo.detail.session-event-item.statusRunning', 'Running')
  }
  if (
    normalizedStatus === 'completed' ||
    normalizedStatus === 'complete' ||
    normalizedStatus === 'success' ||
    normalizedStatus === 'succeeded'
  ) {
    return translate('auto.components.todo.detail.session-event-item.statusCompleted', 'Completed')
  }
  if (
    normalizedStatus === 'error' ||
    normalizedStatus === 'failed' ||
    normalizedStatus === 'failure'
  ) {
    return translate('auto.components.todo.detail.session-event-item.statusFailed', 'Failed')
  }
  if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') {
    return translate('auto.components.todo.detail.session-event-item.statusCanceled', 'Canceled')
  }
  return status
}

function ToolStatus({ status }: { status?: string }): React.JSX.Element | null {
  return status ? (
    <span className="font-sans text-muted-foreground">{formatToolStatus(status)}</span>
  ) : null
}

function DetailContent({
  presentation
}: {
  presentation: AcpToolPresentation
}): React.JSX.Element | null {
  if (presentation.kind === 'file') {
    return <FileDetail presentation={presentation} />
  }
  if (presentation.kind === 'command') {
    return <CommandDetail presentation={presentation} />
  }
  if (presentation.kind === 'subagent') {
    return presentation.result ? (
      <pre
        aria-label={translate(
          'auto.components.todo.detail.session-event-item.subagentResult',
          'Subagent result'
        )}
        className="mt-1 max-h-48 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md bg-accent px-2 py-1 text-xs text-muted-foreground scrollbar-sleek"
      >
        {presentation.result}
      </pre>
    ) : null
  }
  return presentation.detail ? (
    <pre
      aria-label={translate('auto.components.todo.detail.session-event-item.details', 'Details')}
      className="mt-1 max-h-48 min-w-0 max-w-full overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-md bg-accent px-2 py-1 font-mono text-xs text-muted-foreground scrollbar-sleek"
    >
      {presentation.detail}
    </pre>
  ) : null
}

export function SessionToolDetails({ event }: SessionToolDetailsProps): React.JSX.Element {
  // Subscribe independently because the memoized event row may skip parent-driven rerenders.
  useTranslation()
  const presentation = React.useMemo(() => presentAcpToolCall(event), [event])
  const running = RUNNING_STATUSES.has(event.status?.toLowerCase() ?? '')

  if (presentation.kind === 'file') {
    return (
      <SessionDisclosure
        entryKey={event.toolCallId}
        running={running}
        title={
          <span className="font-mono text-foreground">
            {presentation.path ?? presentation.title}
          </span>
        }
        meta={
          <span className="flex items-center gap-2">
            <ToolStatus status={event.status} />
            <span
              aria-label={`${translate(
                'auto.components.todo.detail.session-event-item.changes',
                'Changes'
              )}: +${presentation.added} / -${presentation.removed}`}
              className="flex gap-1 font-mono"
            >
              <span className="text-(--git-decoration-added)">+{presentation.added}</span>
              <span aria-hidden="true">/</span>
              <span className="text-(--git-decoration-deleted)">-{presentation.removed}</span>
            </span>
          </span>
        }
      >
        <DetailContent presentation={presentation} />
      </SessionDisclosure>
    )
  }

  if (presentation.kind === 'command') {
    return (
      <SessionDisclosure
        entryKey={event.toolCallId}
        running={running}
        title={
          <span className="truncate font-mono text-foreground">
            {presentation.command ?? presentation.title}
          </span>
        }
        meta={<ToolStatus status={event.status} />}
      >
        <DetailContent presentation={presentation} />
      </SessionDisclosure>
    )
  }

  if (presentation.kind === 'subagent') {
    return (
      <SessionDisclosure
        entryKey={event.toolCallId}
        running={running}
        title={<SubagentTitle presentation={presentation} status={event.status} />}
        meta={<ToolStatus status={event.status} />}
      >
        <DetailContent presentation={presentation} />
      </SessionDisclosure>
    )
  }

  return (
    <SessionDisclosure
      entryKey={event.toolCallId}
      running={running}
      title={<span className="text-foreground">{presentation.title}</span>}
      meta={<ToolStatus status={event.status} />}
    >
      <DetailContent presentation={presentation} />
    </SessionDisclosure>
  )
}
