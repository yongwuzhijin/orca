import { describe, expect, it } from 'vitest'
import {
  backfillDefaultOnStatusBarItems,
  STATUS_BAR_DEFAULT_BACKFILLS
} from './status-bar-default-backfill'
import { DEFAULT_STATUS_BAR_ITEMS } from './status-bar-defaults'

describe('backfillDefaultOnStatusBarItems', () => {
  it('appends every un-stamped default and reports the flags to persist', () => {
    const result = backfillDefaultOnStatusBarItems(['claude'], {})
    expect(result.items).toEqual([
      'claude',
      ...STATUS_BAR_DEFAULT_BACKFILLS.map((entry) => entry.item)
    ])
    expect(result.pendingFlags).toEqual(STATUS_BAR_DEFAULT_BACKFILLS.map((entry) => entry.flag))
  })

  it('leaves a fully stamped profile untouched', () => {
    const flags = Object.fromEntries(
      STATUS_BAR_DEFAULT_BACKFILLS.map((entry) => [entry.flag, true])
    )
    const result = backfillDefaultOnStatusBarItems(['claude'], flags)
    expect(result.items).toEqual(['claude'])
    expect(result.pendingFlags).toEqual([])
  })

  it('respects a deliberate uncheck once the flag is stamped', () => {
    // Why: the flag, not the item's presence, is what stops the backfill from re-adding it.
    const result = backfillDefaultOnStatusBarItems([], { _translateStatusBarDefaultAdded: true })
    expect(result.items).not.toContain('translate')
    expect(result.pendingFlags).not.toContain('_translateStatusBarDefaultAdded')
  })

  it('stamps a flag without duplicating an item the user already has', () => {
    const result = backfillDefaultOnStatusBarItems(['translate'], {})
    expect(result.items.filter((item) => item === 'translate')).toHaveLength(1)
    expect(result.pendingFlags).toContain('_translateStatusBarDefaultAdded')
  })

  it('does not mutate the input array', () => {
    const items = ['claude'] as const
    backfillDefaultOnStatusBarItems(items, {})
    expect(items).toEqual(['claude'])
  })

  it('keeps every backfilled item in the shipped defaults', () => {
    // Why: a default-on backfill for an item missing from the defaults would only reach upgraded profiles.
    for (const { item } of STATUS_BAR_DEFAULT_BACKFILLS) {
      expect(DEFAULT_STATUS_BAR_ITEMS).toContain(item)
    }
  })
})
