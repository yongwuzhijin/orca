import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ThroughputBucket } from '../../../../../shared/todo/todo-dashboard'
import { translate } from '@/i18n/i18n'

export function ThroughputChart({ data }: { data: ThroughputBucket[] }): React.JSX.Element {
  return (
    <div className="flex h-56 flex-col gap-2">
      <div className="text-sm font-medium text-foreground">
        {translate('auto.components.todo.dashboard.ThroughputChart.title', 'Throughput')}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="bucket" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="count" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
