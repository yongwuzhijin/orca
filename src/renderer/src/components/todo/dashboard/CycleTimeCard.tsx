import type { CycleTimeStats } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '@/i18n/i18n'
import { formatDuration } from './format-dashboard-values'

export function CycleTimeCard({ stats }: { stats: CycleTimeStats }): React.JSX.Element {
  return (
    <div className="flex h-56 flex-col gap-3">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.CycleTimeCard.title', 'Cycle time')}
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.CycleTimeCard.average', 'Average')}
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatDuration(stats.averageMs)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.CycleTimeCard.median', 'Median')}
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatDuration(stats.medianMs)}
          </span>
        </div>
      </div>
      <div className="scrollbar-sleek flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {stats.samples.map((sample) => (
            <li key={sample.taskId} className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate">
                {sample.identifier} · {sample.title}
              </span>
              <span className="shrink-0 pl-2">{formatDuration(sample.durationMs)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
