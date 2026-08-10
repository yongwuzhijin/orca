import { JSON_ROOT_PATH, appendJsonArrayIndex, appendJsonObjectKey } from './json-path'
import { type JsonExpansionState, isJsonNodeCollapsed } from './json-tree-expansion'

export type JsonRowKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export type JsonTreeRow = {
  path: string
  depth: number
  kind: JsonRowKind
  label: string | null
  labelKind: 'key' | 'index' | null
  value: unknown
  childCount: number
  isExpandable: boolean
  isCollapsed: boolean
}

function classify(value: unknown): JsonRowKind {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  switch (typeof value) {
    case 'object':
      return 'object'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'string'
  }
}

function childEntries(
  value: unknown,
  kind: JsonRowKind,
  path: string
): { label: string; labelKind: 'key' | 'index'; path: string; value: unknown }[] {
  if (kind === 'array') {
    return (value as unknown[]).map((child, index) => ({
      label: String(index),
      labelKind: 'index' as const,
      path: appendJsonArrayIndex(path, index),
      value: child
    }))
  }
  if (kind === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, child]) => ({
      label: key,
      labelKind: 'key' as const,
      path: appendJsonObjectKey(path, key),
      value: child
    }))
  }
  return []
}

type PendingJsonNode = {
  value: unknown
  path: string
  depth: number
  label: string | null
  labelKind: 'key' | 'index' | null
}

// Why: an explicit stack, because JSON that jsonc-parser accepts can still nest
// deeper than the call stack allows (closure recursion overflowed near 3.5k deep).
export function buildVisibleJsonRows(value: unknown, expansion: JsonExpansionState): JsonTreeRow[] {
  const rows: JsonTreeRow[] = []
  const pending: PendingJsonNode[] = [
    { value, path: JSON_ROOT_PATH, depth: 0, label: null, labelKind: null }
  ]

  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    const kind = classify(node.value)
    const children = childEntries(node.value, kind, node.path)
    const isExpandable = children.length > 0
    const isCollapsed = isExpandable && isJsonNodeCollapsed(expansion, node.path)

    rows.push({
      path: node.path,
      depth: node.depth,
      kind,
      label: node.label,
      labelKind: node.labelKind,
      value: node.value,
      childCount: children.length,
      isExpandable,
      isCollapsed
    })

    if (!isExpandable || isCollapsed) {
      continue
    }
    // Why: reversed, so popping yields the original depth-first sibling order.
    const childDepth = node.depth + 1
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      pending.push({
        value: child.value,
        path: child.path,
        depth: childDepth,
        label: child.label,
        labelKind: child.labelKind
      })
    }
  }

  return rows
}
