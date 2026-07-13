import { useCallback, useEffect, useState } from 'react'
import type {
  TodoDashboardMetrics,
  TodoDashboardRange
} from '../../../../../shared/todo/todo-dashboard'
import { translate } from '@/i18n/i18n'
import { ToggleGroup, ToggleGroupItem } from '../../ui/toggle-group'
import { ThroughputChart } from './ThroughputChart'
import { EstimateAccuracyChart } from './EstimateAccuracyChart'
import { CycleTimeCard } from './CycleTimeCard'
import { TokenCostCard } from './TokenCostCard'

const RANGES: TodoDashboardRange[] = ['7d', '30d', '90d', 'all']

function rangeLabel(range: TodoDashboardRange): string {
  if (range === 'all') {
    return translate('auto.components.todo.dashboard.TodoDashboard.rangeAll', 'All')
  }
  return range
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; metrics: TodoDashboardMetrics }

export function TodoDashboard({ projectId }: { projectId: string }): React.JSX.Element {
  const [range, setRange] = useState<TodoDashboardRange>('30d')
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    window.api.todos.dashboard
      .getMetrics({ projectId, range })
      .then((metrics) => setState({ kind: 'ready', metrics }))
      .catch(() => setState({ kind: 'error' }))
  }, [projectId, range])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <ToggleGroup
        type="single"
        value={range}
        onValueChange={(next) => {
          if (next) {
            setRange(next as TodoDashboardRange)
          }
        }}
      >
        {RANGES.map((option) => (
          <ToggleGroupItem key={option} value={option}>
            {rangeLabel(option)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {state.kind === 'loading' && (
        <div className="text-sm text-muted-foreground">
          {translate('auto.components.todo.dashboard.TodoDashboard.loading', 'Loading…')}
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col items-start gap-2">
          <div className="text-sm text-muted-foreground">
            {translate(
              'auto.components.todo.dashboard.TodoDashboard.error',
              'Failed to load dashboard.'
            )}
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-muted"
          >
            {translate('auto.components.todo.dashboard.TodoDashboard.retry', 'Retry')}
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.metrics.doneTaskCount === 0 && (
        <div className="text-sm text-muted-foreground">
          {translate(
            'auto.components.todo.dashboard.TodoDashboard.empty',
            'No completed tasks in this range.'
          )}
        </div>
      )}

      {state.kind === 'ready' && state.metrics.doneTaskCount > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ThroughputChart data={state.metrics.throughput} />
          <CycleTimeCard stats={state.metrics.cycleTime} />
          <TokenCostCard summary={state.metrics.tokenCost} />
          <EstimateAccuracyChart data={state.metrics.estimateAccuracy} />
        </div>
      )}
    </div>
  )
}
