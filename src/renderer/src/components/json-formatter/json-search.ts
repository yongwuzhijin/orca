import { JSON_ROOT_PATH, appendJsonArrayIndex, appendJsonObjectKey } from './json-path'
import { formatJsonRowLabel, formatJsonScalarText } from './json-row-text'
import { type JsonRowKind, classifyJsonValue } from './json-tree-rows'

export type JsonSearchField = 'key' | 'value'

export type JsonTextRange = {
  start: number
  end: number
}

export type JsonSearchMatch = {
  path: string
  field: JsonSearchField
  start: number
  end: number
}

export function findTextRanges(text: string, query: string): JsonTextRange[] {
  if (query.length === 0) {
    return []
  }
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  const ranges: JsonTextRange[] = []
  for (
    let start = haystack.indexOf(needle);
    start !== -1;
    start = haystack.indexOf(needle, start + needle.length)
  ) {
    ranges.push({ start, end: start + needle.length })
  }
  return ranges
}

type PendingSearchNode = {
  value: unknown
  path: string
  label: string | null
  labelKind: 'key' | 'index' | null
}

function isContainerKind(kind: JsonRowKind): boolean {
  return kind === 'object' || kind === 'array'
}

// Why: an explicit stack, because buildVisibleJsonRows already overflowed closure recursion
// near 3.5k deep — and this walks every node, including collapsed subtrees.
export function findJsonMatches(value: unknown, query: string): JsonSearchMatch[] {
  if (query.length === 0) {
    return []
  }
  const matches: JsonSearchMatch[] = []
  const pending: PendingSearchNode[] = [
    { value, path: JSON_ROOT_PATH, label: null, labelKind: null }
  ]

  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node.label !== null && node.labelKind === 'key') {
      const labelText = formatJsonRowLabel(node.label, 'key')
      for (const range of findTextRanges(labelText, query)) {
        matches.push({ path: node.path, field: 'key', ...range })
      }
    }
    const kind = classifyJsonValue(node.value)
    if (!isContainerKind(kind)) {
      // Why: containers show `{ … }  8`, which is chrome, not content — only their key is searchable.
      const valueText = formatJsonScalarText(node.value, kind)
      for (const range of findTextRanges(valueText, query)) {
        matches.push({ path: node.path, field: 'value', ...range })
      }
      continue
    }
    // Why: reversed, so popping yields document order.
    if (kind === 'array') {
      const items = node.value as unknown[]
      for (let index = items.length - 1; index >= 0; index -= 1) {
        pending.push({
          value: items[index],
          path: appendJsonArrayIndex(node.path, index),
          label: String(index),
          labelKind: 'index'
        })
      }
      continue
    }
    const entries = Object.entries(node.value as Record<string, unknown>)
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const [key, child] = entries[index]
      pending.push({
        value: child,
        path: appendJsonObjectKey(node.path, key),
        label: key,
        labelKind: 'key'
      })
    }
  }

  return matches
}
