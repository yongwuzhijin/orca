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
