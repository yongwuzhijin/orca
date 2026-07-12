import React from 'react'
import { CheckSquare, Loader2, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { PlanEntry } from '../../../../../shared/acp/session-event'

type PlanChecklistProps = {
  entries: PlanEntry[]
}

function StatusIcon({ status }: { status: PlanEntry['status'] }): React.JSX.Element {
  if (status === 'completed') {
    return <CheckSquare className="size-4 shrink-0 text-green-600" />
  }
  if (status === 'in_progress') {
    return <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />
  }
  return <Square className="size-4 shrink-0 text-muted-foreground" />
}

export function PlanChecklist({ entries }: PlanChecklistProps): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        {translate('auto.components.todo.detail.PlanChecklist.empty', 'No plan yet')}
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map((entry, i) => (
        <li
          key={`${i}-${entry.content}`}
          data-status={entry.status}
          className={cn(
            'flex items-start gap-2 text-sm',
            entry.status === 'completed' && 'text-muted-foreground line-through'
          )}
        >
          <StatusIcon status={entry.status} />
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{entry.content}</span>
        </li>
      ))}
    </ul>
  )
}
