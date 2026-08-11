import { listJsonAncestorPaths } from './json-path'

export type JsonExpansionState = {
  readonly defaultCollapsed: boolean
  // Why: holds paths whose state is the inverse of defaultCollapsed, so
  // collapse-all / expand-all stay O(1) instead of enumerating every node.
  readonly overrides: ReadonlySet<string>
}

export function createJsonExpansion(): JsonExpansionState {
  return { defaultCollapsed: false, overrides: new Set() }
}

export function isJsonNodeCollapsed(state: JsonExpansionState, path: string): boolean {
  return state.overrides.has(path) ? !state.defaultCollapsed : state.defaultCollapsed
}

export function toggleJsonNode(state: JsonExpansionState, path: string): JsonExpansionState {
  const overrides = new Set(state.overrides)
  if (overrides.has(path)) {
    overrides.delete(path)
  } else {
    overrides.add(path)
  }
  return { defaultCollapsed: state.defaultCollapsed, overrides }
}

export function collapseAllJsonNodes(): JsonExpansionState {
  return { defaultCollapsed: true, overrides: new Set() }
}

export function expandAllJsonNodes(): JsonExpansionState {
  return { defaultCollapsed: false, overrides: new Set() }
}

// Why: overrides hold the inverse of defaultCollapsed, so "expand" flips sides with it.
export function expandJsonAncestors(state: JsonExpansionState, path: string): JsonExpansionState {
  const ancestors = listJsonAncestorPaths(path)
  if (ancestors.length === 0) {
    return state
  }
  const overrides = new Set(state.overrides)
  for (const ancestor of ancestors) {
    if (state.defaultCollapsed) {
      overrides.add(ancestor)
    } else {
      overrides.delete(ancestor)
    }
  }
  if (overrides.size === state.overrides.size) {
    return state
  }
  return { defaultCollapsed: state.defaultCollapsed, overrides }
}

export function pruneJsonSubtreeOverrides(
  state: JsonExpansionState,
  path: string
): JsonExpansionState {
  // Why: paths are prefix-encoded, so a descendant always continues with `.` or `[` —
  // matching a bare prefix would sweep up data[10] along with data[1].
  const overrides = new Set(
    [...state.overrides].filter(
      (override) =>
        override !== path && !override.startsWith(`${path}.`) && !override.startsWith(`${path}[`)
    )
  )
  if (overrides.size === state.overrides.size) {
    return state
  }
  return { defaultCollapsed: state.defaultCollapsed, overrides }
}
