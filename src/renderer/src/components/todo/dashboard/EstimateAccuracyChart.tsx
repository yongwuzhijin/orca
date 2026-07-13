import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { EstimateAccuracyPoint } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '@/i18n/i18n'

export function EstimateAccuracyChart({
  data
}: {
  data: EstimateAccuracyPoint[]
}): React.JSX.Element {
  const points = data.map((point) => ({
    x: point.estimatePoints,
    y: point.actualMs / 3600000,
    title: point.title
  }))
  return (
    <div className="flex h-56 flex-col gap-2">
      <div className="text-sm font-medium text-foreground">
        {translate(
          'auto.components.todo.dashboard.EstimateAccuracyChart.title',
          'Estimate vs actual'
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            name={translate(
              'auto.components.todo.dashboard.EstimateAccuracyChart.xAxis',
              'Estimate (points)'
            )}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={translate(
              'auto.components.todo.dashboard.EstimateAccuracyChart.yAxis',
              'Actual (hours)'
            )}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={points} fill="var(--chart-2)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
