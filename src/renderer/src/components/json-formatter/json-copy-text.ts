import type { JsonTreeRow } from './json-tree-rows'

function toValueJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function buildJsonPairText(row: JsonTreeRow): string {
  const valueJson = toValueJson(row.value)
  if (row.labelKind !== 'key' || row.label === null) {
    return valueJson
  }
  return `${JSON.stringify(row.label)}: ${valueJson}`
}

export function buildJsonValueText(row: JsonTreeRow): string {
  // Why: a bare string is what you want to paste; the quotes are JSON syntax, not content.
  return row.kind === 'string' ? String(row.value) : toValueJson(row.value)
}
