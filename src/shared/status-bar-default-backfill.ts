import type { StatusBarItem } from './ui-chrome-types'

/** One-shot flags recording that a default-on item was already offered to an upgraded profile. */
export type StatusBarDefaultBackfillFlag =
  | '_portsStatusBarDefaultAdded'
  | '_kimiStatusBarDefaultAdded'
  | '_minimaxStatusBarDefaultAdded'
  | '_antigravityStatusBarDefaultAdded'
  | '_grokStatusBarDefaultAdded'
  | '_translateStatusBarDefaultAdded'

// Append-only: each row backfills once, so a later deliberate uncheck sticks.
export const STATUS_BAR_DEFAULT_BACKFILLS: readonly {
  item: StatusBarItem
  flag: StatusBarDefaultBackfillFlag
}[] = [
  { item: 'ports', flag: '_portsStatusBarDefaultAdded' },
  { item: 'kimi', flag: '_kimiStatusBarDefaultAdded' },
  { item: 'minimax', flag: '_minimaxStatusBarDefaultAdded' },
  { item: 'antigravity', flag: '_antigravityStatusBarDefaultAdded' },
  { item: 'grok', flag: '_grokStatusBarDefaultAdded' },
  { item: 'translate', flag: '_translateStatusBarDefaultAdded' }
]

export type StatusBarDefaultBackfillResult = {
  items: StatusBarItem[]
  /** Flags to stamp; empty means nothing to persist. */
  pendingFlags: StatusBarDefaultBackfillFlag[]
}

export function backfillDefaultOnStatusBarItems(
  items: readonly StatusBarItem[],
  flags: Partial<Record<StatusBarDefaultBackfillFlag, boolean | undefined>>
): StatusBarDefaultBackfillResult {
  const next = [...items]
  const pendingFlags: StatusBarDefaultBackfillFlag[] = []
  for (const { item, flag } of STATUS_BAR_DEFAULT_BACKFILLS) {
    if (flags[flag] === true) {
      continue
    }
    pendingFlags.push(flag)
    if (!next.includes(item)) {
      next.push(item)
    }
  }
  return { items: next, pendingFlags }
}
