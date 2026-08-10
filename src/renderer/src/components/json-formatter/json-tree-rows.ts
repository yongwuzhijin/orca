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

export function buildVisibleJsonRows(value: unknown, expansion: JsonExpansionState): JsonTreeRow[] {
  const rows: JsonTreeRow[] = []

  const visit = (
    nodeValue: unknown,
    path: string,
    depth: number,
    label: string | null,
    labelKind: 'key' | 'index' | null
  ): void => {
    const kind = classify(nodeValue)
    const children = childEntries(nodeValue, kind, path)
    const isExpandable = children.length > 0
    const isCollapsed = isExpandable && isJsonNodeCollapsed(expansion, path)

    rows.push({
      path,
      depth,
      kind,
      label,
      labelKind,
      value: nodeValue,
      childCount: children.length,
      isExpandable,
      isCollapsed
    })

    if (!isExpandable || isCollapsed) {
      return
    }
    for (const child of children) {
      visit(child.value, child.path, depth + 1, child.label, child.labelKind)
    }
  }

  visit(value, JSON_ROOT_PATH, 0, null, null)
  return rows
}
