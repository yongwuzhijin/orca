import {
  AlertTriangle,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
  type LucideIcon
} from 'lucide-react'

import { TODO_PRIORITIES, type TodoPriority } from '../../../../shared/todo/todo-priority'

export type TodoPriorityMeta = {
  id: TodoPriority
  labelKey: string
  fallbackLabel: string
  colorToken: string
  icon: LucideIcon
}

// Presentation metadata for each priority, in the canonical TODO_PRIORITIES order.
// colorToken values are existing tokens/classes from main.css usage — never invent hex.
export const TODO_PRIORITY_CATALOG: readonly TodoPriorityMeta[] = [
  {
    id: 'none',
    labelKey: 'auto.components.todo.priority.none',
    fallbackLabel: 'No priority',
    colorToken: 'text-muted-foreground',
    icon: Minus
  },
  {
    id: 'low',
    labelKey: 'auto.components.todo.priority.low',
    fallbackLabel: 'Low',
    colorToken: 'text-muted-foreground',
    icon: SignalLow
  },
  {
    id: 'medium',
    labelKey: 'auto.components.todo.priority.medium',
    fallbackLabel: 'Medium',
    colorToken: 'text-foreground',
    icon: SignalMedium
  },
  {
    id: 'high',
    labelKey: 'auto.components.todo.priority.high',
    fallbackLabel: 'High',
    colorToken: 'text-amber-500',
    icon: SignalHigh
  },
  {
    id: 'urgent',
    labelKey: 'auto.components.todo.priority.urgent',
    fallbackLabel: 'Urgent',
    colorToken: 'text-destructive',
    icon: AlertTriangle
  }
]

const PRIORITY_META_BY_ID = new Map<TodoPriority, TodoPriorityMeta>(
  TODO_PRIORITY_CATALOG.map((meta) => [meta.id, meta])
)

export function getTodoPriorityMeta(priority: TodoPriority): TodoPriorityMeta {
  const meta = PRIORITY_META_BY_ID.get(priority)
  if (meta === undefined) {
    throw new Error(`Unknown todo priority: ${priority}`)
  }
  return meta
}

if (TODO_PRIORITY_CATALOG.map((meta) => meta.id).join(',') !== TODO_PRIORITIES.join(',')) {
  throw new Error('TODO_PRIORITY_CATALOG order is out of sync with TODO_PRIORITIES')
}
