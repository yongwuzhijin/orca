import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type {
  TodoAcpEngine,
  TodoExecutionMode
} from '../../../../../shared/todo/todo-execution-mode'
import { isTodoAcpEngine, TODO_ACP_ENGINES } from '../../../../../shared/todo/todo-execution-mode'

export const ACP_ENGINE_LABELS: Record<TodoAcpEngine, string> = {
  cursor: 'Cursor',
  qoder: 'Qoder'
}

export const ENTER_DIALOG_SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export function resolveInitialExecutionMode(item: TodoItem): TodoExecutionMode {
  return item.executionMode === 'terminal' ? 'terminal' : 'acp'
}

export function resolveAcpEngine(
  preferred: string | null | undefined,
  installed: ReadonlySet<string> | null
): TodoAcpEngine | null {
  const candidates =
    installed === null
      ? [...TODO_ACP_ENGINES]
      : TODO_ACP_ENGINES.filter((engine) => installed.has(engine))
  if (preferred && isTodoAcpEngine(preferred) && candidates.includes(preferred)) {
    return preferred
  }
  return candidates[0] ?? null
}
