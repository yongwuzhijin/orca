import type { TabContentType } from '../../../shared/tab-types'

// Why its own module: the entry builder needs this at runtime while the search
// module re-exports it, and importing it back from there is a real cycle.
export const WORKSPACE_TAB_CONTENT_TYPES = [
  'terminal',
  'editor',
  'diff',
  'conflict-review',
  'check-details',
  'json-formatter'
] as const satisfies readonly TabContentType[]

export type WorkspaceTabContentType = (typeof WORKSPACE_TAB_CONTENT_TYPES)[number]
