import type { JsonRowKind } from './json-tree-rows'

export function formatJsonRowLabel(label: string, labelKind: 'key' | 'index'): string {
  // Why: an index is bare, but a key is JSON text — quotes and newlines in it must escape.
  return labelKind === 'index' ? label : JSON.stringify(label)
}

export function formatJsonScalarText(value: unknown, kind: JsonRowKind): string {
  switch (kind) {
    case 'string':
      return JSON.stringify(value)
    case 'null':
      return 'null'
    // Why: containers render via formatJsonContainerText; listed here only to keep the switch exhaustive.
    case 'number':
    case 'boolean':
    case 'object':
    case 'array':
      return String(value)
  }
}

export function formatJsonContainerText(kind: JsonRowKind, childCount: number): string {
  const [open, close] = kind === 'array' ? ['[', ']'] : ['{', '}']
  if (childCount === 0) {
    return `${open}${close}`
  }
  return `${open} … ${close}  ${childCount}`
}
