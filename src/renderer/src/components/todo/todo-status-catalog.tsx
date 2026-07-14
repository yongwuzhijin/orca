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
  /** Top accent border — matched to workspace board lane chrome. */
  laneBorder: string
  /** Subtle column wash — matched to workspace board laneTint tokens. */
  laneTint: string
  icon: LucideIcon
  defaultVisibleColumn: boolean
  terminal: boolean
  order: number
}

// Presentation metadata for each status, in the canonical TODO_STATUSES order.
// colorToken / lane* values reuse classes already used by the workspace board.
export const TODO_STATUS_CATALOG: readonly TodoStatusMeta[] = [
  {
    id: 'backlog',
    labelKey: 'auto.components.todo.status.backlog',
    fallbackLabel: 'Backlog',
    colorToken: 'text-muted-foreground',
    laneBorder: 'border-t-muted-foreground/45',
    laneTint: 'bg-background/55',
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
    laneBorder: 'border-t-muted-foreground/45',
    laneTint: 'bg-background/55',
    icon: Circle,
    defaultVisibleColumn: true,
    terminal: false,
    order: 2
  },
  {
    id: 'in_progress',
    labelKey: 'auto.components.todo.status.in_progress',
    fallbackLabel: 'In Progress',
    colorToken: 'text-[#d4a300]',
    laneBorder: 'border-t-[#d4a300]/70',
    laneTint: 'bg-[#d4a300]/[0.04]',
    icon: Loader,
    defaultVisibleColumn: true,
    terminal: false,
    order: 3
  },
  {
    id: 'rework',
    labelKey: 'auto.components.todo.status.rework',
    fallbackLabel: 'Rework',
    colorToken: 'text-amber-700 dark:text-amber-200',
    laneBorder: 'border-t-amber-500/70',
    laneTint: 'bg-amber-500/[0.04]',
    icon: RefreshCw,
    defaultVisibleColumn: false,
    terminal: false,
    order: 4
  },
  {
    id: 'human_review',
    labelKey: 'auto.components.todo.status.human_review',
    fallbackLabel: 'Human Review',
    colorToken: 'text-[#16a34a]',
    laneBorder: 'border-t-[#16a34a]/70',
    laneTint: 'bg-[#16a34a]/[0.04]',
    icon: Eye,
    defaultVisibleColumn: true,
    terminal: false,
    order: 5
  },
  {
    id: 'merging',
    labelKey: 'auto.components.todo.status.merging',
    fallbackLabel: 'Merging',
    colorToken: 'text-blue-600 dark:text-blue-300',
    laneBorder: 'border-t-blue-500/70',
    laneTint: 'bg-blue-500/[0.04]',
    icon: GitMerge,
    defaultVisibleColumn: false,
    terminal: false,
    order: 6
  },
  {
    id: 'done',
    labelKey: 'auto.components.todo.status.done',
    fallbackLabel: 'Done',
    colorToken: 'text-[#c7a594]',
    laneBorder: 'border-t-[#c7a594]/70',
    laneTint: 'bg-[#c7a594]/[0.04]',
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
    laneBorder: 'border-t-muted-foreground/45',
    laneTint: 'bg-background/55',
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
    laneBorder: 'border-t-muted-foreground/45',
    laneTint: 'bg-background/55',
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
