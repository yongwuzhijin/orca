import type { TokenCostSummary } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '@/i18n/i18n'
import { formatTokens, formatUsd } from './format-dashboard-values'

export function TokenCostCard({ summary }: { summary: TokenCostSummary }): React.JSX.Element {
  return (
    <div className="flex h-56 flex-col gap-3">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.TokenCostCard.title', 'Token cost')}
      </div>
      <div className="flex gap-6">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.TokenCostCard.tokens', 'Tokens')}
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatTokens(summary.totalTokens)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {translate('auto.components.todo.dashboard.TokenCostCard.cost', 'Est. cost')}
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatUsd(summary.estimatedCostUsd)}
          </span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {translate('auto.components.todo.dashboard.TokenCostCard.coverage', 'Attributed')}:{' '}
        {summary.knownTaskCount} / {summary.knownTaskCount + summary.unavailableTaskCount}
      </div>
      <div className="scrollbar-sleek flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {summary.perTask.map((task) => (
            <li
              key={task.taskId}
              className={`flex justify-between text-xs ${
                task.status === 'known' ? 'text-muted-foreground' : 'text-muted-foreground/50'
              }`}
            >
              <span className="truncate">
                {task.identifier} · {task.title}
              </span>
              <span className="shrink-0 pl-2">
                {task.status === 'known' && task.totalTokens !== null
                  ? formatTokens(task.totalTokens)
                  : translate('auto.components.todo.dashboard.TokenCostCard.unavailable', 'n/a')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
