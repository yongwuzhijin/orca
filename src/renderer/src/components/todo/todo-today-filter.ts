import type { TodoItem } from '../../../../shared/todo/todo-item'

// Use local calendar fields, not toISOString(): UTC conversion can shift the
// date across day boundaries for non-UTC timezones (off-by-one bug).
export function localTodayIso(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Unscheduled todos are always shown; scheduled ones show once due today or overdue.
// Both operands are YYYY-MM-DD, so lexical comparison matches chronological order.
export function isTodoDueToday(
  item: Pick<TodoItem, 'scheduledDate'>,
  today: string = localTodayIso()
): boolean {
  if (item.scheduledDate === null) {
    return true
  }
  return item.scheduledDate <= today
}
