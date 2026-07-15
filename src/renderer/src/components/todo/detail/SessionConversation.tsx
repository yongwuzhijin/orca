import React from 'react'
import { ArrowUp, ChevronDown, MessageCircleQuestion, Square, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { PermissionRequest, SessionEvent } from '../../../../../shared/acp/session-event'
import type { AcpSessionStatus } from '../../../store/slices/acp'
import { buildAcpSessionTimeline } from './acp-session-timeline'
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
  const timeline = React.useMemo(() => buildAcpSessionTimeline(events), [events])
  const running = status === 'running'
  const automaticModeLabel = translate(
    'auto.components.todo.detail.SessionConversation.automaticMode',
    'Automatic mode'
  )
  const confirmationModeLabel = translate(
    'auto.components.todo.detail.SessionConversation.confirmationMode',
    'Confirmation mode'
  )
  const currentModeLabel = mode === 'auto' ? automaticModeLabel : confirmationModeLabel

  const submit = (): void => {
    const text = draft.trim()
    if (!text || running) {
      return
    }
    onSend(text)
    setDraft('')
  }

  return (
    <div
      data-testid="session-conversation"
      className="@container/session-conversation flex min-h-0 min-w-0 w-full flex-1 flex-col gap-2"
    >
      {/* Why: overflow-y-auto alone makes browsers compute overflow-x as auto,
          which surfaces a horizontal scrollbar for long paths. Above 600px the
          transcript should clip horizontally and rely on wrapping instead. */}
      <div
        data-testid="session-transcript"
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-auto overflow-y-auto pr-1 scrollbar-sleek @[600px]/session-conversation:overflow-x-hidden"
      >
        {timeline.map((event, i) => {
          const eventKey =
            event.kind === 'tool_call' && event.toolCallId ? `tool:${event.toolCallId}` : i
          return <SessionEventItem key={eventKey} eventKey={eventKey} event={event} />
        })}
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

      <div
        data-testid="session-composer"
        className="shrink-0 rounded-xl border border-border bg-background p-2 shadow-xs"
      >
        <Input
          value={draft}
          disabled={running}
          className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
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
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="max-w-48 text-muted-foreground"
              >
                {mode === 'auto' ? <Zap /> : <MessageCircleQuestion />}
                <span className="truncate">{currentModeLabel}</span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuRadioGroup
                value={mode}
                onValueChange={(value) => onModeChange(value as PermissionMode)}
              >
                <DropdownMenuRadioItem value="auto">
                  <Zap />
                  {automaticModeLabel}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ask">
                  <MessageCircleQuestion />
                  {confirmationModeLabel}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="min-w-0 flex-1" />
          {running ? (
            <Button
              type="button"
              size="icon-xs"
              className="shrink-0 rounded-full"
              aria-label={translate(
                'auto.components.todo.detail.SessionConversation.stop',
                'Stop session'
              )}
              onClick={onCancel}
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-xs"
              className="shrink-0 rounded-full"
              disabled={!draft.trim()}
              aria-label={translate('auto.components.todo.detail.SessionConversation.send', 'Send')}
              onClick={submit}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
