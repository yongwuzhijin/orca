import { z } from 'zod'
import { isPluginPanelTabKey } from '../../../../shared/plugins/plugin-manifest'

const STATIC_RIGHT_SIDEBAR_TABS = [
  'explorer',
  'search',
  'vault',
  'workspaces',
  'pr-checks',
  'source-control',
  'checks',
  'ports',
  'bookmarks'
] as const
type StaticRightSidebarTab = (typeof STATIC_RIGHT_SIDEBAR_TABS)[number]
// Plugin panels are open-ended `plugin:<publisher>.<id>/<panel>` keys, so the
// schema validates their shape rather than enumerating them.
export const RightSidebarTabParam = z.custom<StaticRightSidebarTab | `plugin:${string}`>(
  (value) =>
    typeof value === 'string' &&
    (STATIC_RIGHT_SIDEBAR_TABS.includes(value as StaticRightSidebarTab) ||
      isPluginPanelTabKey(value)),
  { message: 'Unknown right sidebar tab' }
)
