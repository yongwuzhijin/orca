import {
  Ban,
  Circle,
  CircleCheckBig,
  CircleDashed,
  Copy,
  Eye,
  GitMerge,
  Loader,
  RefreshCw,
  type LucideIcon
} from 'lucide-react'

import {
  isTerminalTodoStatus,
  TODO_STATUSES,
  type TodoStatus
} from '../../../../shared/todo/todo-status'

export type TodoStatusMeta = {
  id: TodoStatus
  labelKey: string
  fallbackLabel: string
  colorToken: string
  icon: LucideIcon
  defaultVisibleColumn: boolean
  terminal: boolean
  order: number
}

// Presentation metadata for each status, in the canonical TODO_STATUSES order.
// colorToken values are existing tokens/classes from main.css usage — never invent hex.
export const TODO_STATUS_CATALOG: readonly TodoStatusMeta[] = [
  {
    id: 'backlog',
    labelKey: 'auto.components.todo.status.backlog',
    fallbackLabel: 'Backlog',
    colorToken: 'text-muted-foreground',
    icon: CircleDashed,
    defaultVisibleColumn: true,
    terminal: false,
    order: 1
  },
  {
    id: 'todo',
    labelKey: 'auto.components.todo.status.todo',
    fallbackLabel: 'Todo',
    colorToken: 'text-foreground',
    icon: Circle,
    defaultVisibleColumn: true,
    terminal: false,
    order: 2
  },
  {
    id: 'in_progress',
    labelKey: 'auto.components.todo.status.in_progress',
    fallbackLabel: 'In Progress',
    colorToken: 'text-primary',
    icon: Loader,
    defaultVisibleColumn: true,
    terminal: false,
    order: 3
  },
  {
    id: 'rework',
    labelKey: 'auto.components.todo.status.rework',
    fallbackLabel: 'Rework',
    colorToken: 'text-amber-500',
    icon: RefreshCw,
    defaultVisibleColumn: false,
    terminal: false,
    order: 4
  },
  {
    id: 'human_review',
    labelKey: 'auto.components.todo.status.human_review',
    fallbackLabel: 'Human Review',
    colorToken: 'text-violet-500',
    icon: Eye,
    defaultVisibleColumn: true,
    terminal: false,
    order: 5
  },
  {
    id: 'merging',
    labelKey: 'auto.components.todo.status.merging',
    fallbackLabel: 'Merging',
    colorToken: 'text-blue-500',
    icon: GitMerge,
    defaultVisibleColumn: false,
    terminal: false,
    order: 6
  },
  {
    id: 'done',
    labelKey: 'auto.components.todo.status.done',
    fallbackLabel: 'Done',
    colorToken: 'text-status-success',
    icon: CircleCheckBig,
    defaultVisibleColumn: true,
    terminal: true,
    order: 7
  },
  {
    id: 'canceled',
    labelKey: 'auto.components.todo.status.canceled',
    fallbackLabel: 'Canceled',
    colorToken: 'text-muted-foreground',
    icon: Ban,
    defaultVisibleColumn: false,
    terminal: true,
    order: 8
  },
  {
    id: 'duplicate',
    labelKey: 'auto.components.todo.status.duplicate',
    fallbackLabel: 'Duplicate',
    colorToken: 'text-muted-foreground',
    icon: Copy,
    defaultVisibleColumn: false,
    terminal: true,
    order: 9
  }
]

const STATUS_META_BY_ID = new Map<TodoStatus, TodoStatusMeta>(
  TODO_STATUS_CATALOG.map((meta) => [meta.id, meta])
)

export function getTodoStatusMeta(status: TodoStatus): TodoStatusMeta {
  const meta = STATUS_META_BY_ID.get(status)
  if (meta === undefined) {
    throw new Error(`Unknown todo status: ${status}`)
  }
  return meta
}

export function getVisibleTodoStatuses(): TodoStatusMeta[] {
  return TODO_STATUS_CATALOG.filter((meta) => meta.defaultVisibleColumn)
}

// Guard the terminal flags against drift from the shared source of truth.
if (TODO_STATUS_CATALOG.some((meta) => meta.terminal !== isTerminalTodoStatus(meta.id))) {
  throw new Error('TODO_STATUS_CATALOG terminal flags are out of sync with isTerminalTodoStatus')
}

if (TODO_STATUS_CATALOG.map((meta) => meta.id).join(',') !== TODO_STATUSES.join(',')) {
  throw new Error('TODO_STATUS_CATALOG order is out of sync with TODO_STATUSES')
}
