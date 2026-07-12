import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { PermissionRequest, SessionEvent } from '../../../../../shared/acp/session-event'
import type { AcpSessionStatus } from '../../../store/slices/acp'
import { SessionEventItem } from './session-event-item'
import { PermissionRequestCard } from './PermissionRequestCard'

type PermissionMode = 'auto' | 'ask'

type SessionConversationProps = {
  events: SessionEvent[]
  permissionRequests: PermissionRequest[]
  status: AcpSessionStatus
  mode: PermissionMode
  onSend: (text: string) => void
  onCancel: () => void
  onModeChange: (mode: PermissionMode) => void
  onResolvePermission: (requestId: string, optionId: string) => void
  onSwitchAuto: () => void
}

export function SessionConversation({
  events,
  permissionRequests,
  status,
  mode,
  onSend,
  onCancel,
  onModeChange,
  onResolvePermission,
  onSwitchAuto
}: SessionConversationProps): React.JSX.Element {
  const [draft, setDraft] = React.useState('')
  const running = status === 'running'

  const submit = (): void => {
    const text = draft.trim()
    if (!text || running) {
      return
    }
    onSend(text)
    setDraft('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={mode === 'ask'}
            onChange={(e) => onModeChange(e.target.checked ? 'ask' : 'auto')}
          />
          {translate(
            'auto.components.todo.detail.SessionConversation.askMode',
            'Ask before actions'
          )}
        </label>
        <div className="flex-1" />
        {running ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            {translate('auto.components.todo.detail.SessionConversation.cancel', 'Cancel')}
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto scrollbar-sleek pr-1">
        {events.map((event, i) => (
          <SessionEventItem key={i} event={event} />
        ))}
        {mode === 'ask'
          ? permissionRequests.map((request) => (
              <PermissionRequestCard
                key={request.requestId}
                request={request}
                onResolve={onResolvePermission}
                onSwitchAuto={onSwitchAuto}
              />
            ))
          : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <Input
          value={draft}
          disabled={running}
          placeholder={translate(
            'auto.components.todo.detail.SessionConversation.followUp',
            'Send a follow-up prompt…'
          )}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button size="sm" disabled={running || !draft.trim()} onClick={submit}>
          {translate('auto.components.todo.detail.SessionConversation.send', 'Send')}
        </Button>
      </div>
    </div>
  )
}
