import React from 'react'
import { translate } from '@/i18n/i18n'
import type { SessionEvent } from '../../../../../shared/acp/session-event'
import { SessionDisclosure } from './SessionDisclosure'
import { SessionToolDetails } from './SessionToolDetails'

type SessionEventItemProps = {
  eventKey: React.Key
  event: SessionEvent
}

// Why: renderer only consumes the normalized SessionEvent union (Phase D),
// so this component maps each kind to a presentation without ACP specifics.
function SessionEventItemComponent({ eventKey, event }: SessionEventItemProps): React.JSX.Element {
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
    return (
      <SessionDisclosure
        entryKey={`thought:${String(eventKey)}`}
        title={
          <span className="text-muted-foreground">
            {translate('auto.components.todo.detail.session-event-item.thought', 'Thought')}
          </span>
        }
      >
        <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{event.text}</div>
      </SessionDisclosure>
    )
  }
  if (event.kind === 'tool_call') {
    return <SessionToolDetails event={event} />
  }
  // ext: fallthrough badge for cursor-proprietary notifications.
  return (
    <div className="text-xs text-muted-foreground">
      <span className="rounded bg-muted px-1.5 py-0.5">{event.method}</span>
    </div>
  )
}

// Tool payloads can be large; draft-only parent renders must not rebuild their presentation.
// Other event kinds stay live for locale and disclosure context updates.
export const SessionEventItem = React.memo(
  SessionEventItemComponent,
  (previous, next) =>
    previous.event.kind === 'tool_call' &&
    previous.event === next.event &&
    previous.eventKey === next.eventKey
)
