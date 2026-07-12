import React from 'react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SessionEvent } from '../../../../../shared/acp/session-event'

type SessionEventItemProps = {
  event: SessionEvent
}

// Why: renderer only consumes the normalized SessionEvent union (Phase D),
// so this component maps each kind to a presentation without ACP specifics.
export function SessionEventItem({ event }: SessionEventItemProps): React.JSX.Element {
  if (event.kind === 'agent_message') {
    return <div className="whitespace-pre-wrap text-sm text-foreground">{event.text}</div>
  }
  if (event.kind === 'user_message') {
    return (
      <div className="whitespace-pre-wrap rounded-md bg-accent px-3 py-2 text-sm text-foreground">
        {event.text}
      </div>
    )
  }
  if (event.kind === 'thought') {
    // Why: static "Thought" summary label (not the text itself) so the body is
    // the single place the thought text renders — avoids duplicate DOM matches.
    return (
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">
          {translate('auto.components.todo.detail.session-event-item.thought', 'Thought')}
        </summary>
        <div className="mt-1 whitespace-pre-wrap">{event.text}</div>
      </details>
    )
  }
  if (event.kind === 'tool_call') {
    return (
      <details className="rounded-md border border-border px-3 py-2 text-xs">
        <summary className="flex cursor-pointer select-none items-center gap-2">
          <span className="font-medium text-foreground">{event.title}</span>
          {event.status ? (
            <span className={cn('text-muted-foreground')}>· {event.status}</span>
          ) : null}
        </summary>
        {event.rawInput !== undefined ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(event.rawInput, null, 2)}
          </pre>
        ) : null}
        {event.content !== undefined ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(event.content, null, 2)}
          </pre>
        ) : null}
      </details>
    )
  }
  // ext: fallthrough badge for cursor-proprietary notifications.
  return (
    <div className="text-xs text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5">{event.method}</span>
    </div>
  )
}
