import React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { PlanChecklist } from './PlanChecklist'
import { SessionConversation } from './SessionConversation'
import { EnterInProgressDialog } from './EnterInProgressDialog'

type InProgressPanelProps = {
  item: TodoItem
  showPlan?: boolean
}

export function InProgressPanel({
  item,
  showPlan = true
}: InProgressPanelProps): React.JSX.Element {
  const loadSessions = useAppStore((s) => s.loadSessions)
  const sendFollowUp = useAppStore((s) => s.sendFollowUp)
  const cancelSession = useAppStore((s) => s.cancelSession)
  const setPermissionMode = useAppStore((s) => s.setPermissionMode)
  const resolvePermission = useAppStore((s) => s.resolvePermission)
  const activeSessionId = useAppStore((s) => s.activeSessionByTask[item.id] ?? null)
  const meta = useAppStore((s) => s.activeSessionMetaByTask[item.id])
  const events = useAppStore((s) =>
    activeSessionId ? s.eventsBySession[activeSessionId] : undefined
  )
  const plan = useAppStore((s) => (activeSessionId ? s.planBySession[activeSessionId] : undefined))
  const permissionRequests = useAppStore((s) =>
    activeSessionId ? s.permissionRequestsBySession[activeSessionId] : undefined
  )
  const mode = useAppStore((s) =>
    activeSessionId ? s.permissionModeBySession[activeSessionId] : undefined
  )
  const status = useAppStore((s) =>
    activeSessionId ? s.sessionStatusBySession[activeSessionId] : undefined
  )
  const [launchOpen, setLaunchOpen] = React.useState(false)
  const [restoringSession, setRestoringSession] = React.useState(true)

  React.useEffect(() => {
    let mounted = true
    setRestoringSession(true)
    void loadSessions(item.id)
      .catch((error: unknown) => {
        console.warn('[acp] failed to restore task session:', error)
      })
      .finally(() => {
        if (mounted) {
          setRestoringSession(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [item.id, loadSessions])

  if (restoringSession) {
    const label = translate(
      'auto.components.todo.detail.InProgressPanel.restoring',
      'Restoring session…'
    )
    return (
      <div
        role="status"
        aria-label={label}
        className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="text-sm">{label}</span>
      </div>
    )
  }

  if (!activeSessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">
          {translate('auto.components.todo.detail.InProgressPanel.noSession', 'No active session')}
        </p>
        <Button size="sm" onClick={() => setLaunchOpen(true)}>
          {translate('auto.components.todo.detail.InProgressPanel.start', 'Start session')}
        </Button>
        {launchOpen ? (
          <EnterInProgressDialog item={item} onClose={() => setLaunchOpen(false)} />
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={
        showPlan
          ? 'grid h-full min-h-0 min-w-0 grid-cols-[16rem_minmax(0,1fr)] gap-4'
          : 'flex h-full min-h-0 min-w-0 flex-col'
      }
    >
      {showPlan ? (
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto scrollbar-sleek border-r border-border pr-3">
          <h3 className="text-xs font-medium uppercase text-muted-foreground">
            {translate('auto.components.todo.detail.InProgressPanel.plan', 'Plan')}
          </h3>
          <PlanChecklist entries={plan ?? []} />
        </aside>
      ) : null}
      <SessionConversation
        events={events ?? []}
        permissionRequests={permissionRequests ?? []}
        status={status ?? 'running'}
        mode={mode ?? 'auto'}
        onSend={(text) =>
          void sendFollowUp(item.id, meta?.engine ?? 'claude', meta?.cwd ?? '', text)
        }
        onCancel={() => void cancelSession(activeSessionId)}
        onModeChange={(next) => void setPermissionMode(activeSessionId, next)}
        onResolvePermission={(requestId, optionId) =>
          void resolvePermission(activeSessionId, requestId, optionId)
        }
        onSwitchAuto={() => void setPermissionMode(activeSessionId, 'auto')}
      />
    </div>
  )
}
