export type TodoPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent'

export const TODO_PRIORITIES: readonly TodoPriority[] = [
  'none',
  'low',
  'medium',
  'high',
  'urgent'
] as const

export function isTodoPriority(value: unknown): value is TodoPriority {
  return typeof value === 'string' && (TODO_PRIORITIES as readonly string[]).includes(value)
}
