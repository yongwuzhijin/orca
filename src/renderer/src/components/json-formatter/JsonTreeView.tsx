import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { translate } from '@/i18n/i18n'
import { describeJsonParseError } from './json-parse-error-message'
import type { JsonSearchMatch } from './json-search'
import { JsonTreeRow } from './JsonTreeRow'
import type { JsonRowActionHandlers } from './JsonTreeRowActions'
import { buildVisibleJsonRows } from './json-tree-rows'
import type { JsonTreeRow as JsonTreeRowData } from './json-tree-rows'
import type { JsonExpansionState } from './json-tree-expansion'
import type { JsonParseResult } from './parse-json-input'

// Why: rows are single-line `leading-[22px]`, so height is exact and needs no measurement.
const JSON_TREE_ROW_HEIGHT = 22
const JSON_TREE_ROW_OVERSCAN = 12

const NO_ROWS: JsonTreeRowData[] = []

type JsonTreeViewProps = {
  result: JsonParseResult
  expansion: JsonExpansionState
  showLineNumbers: boolean
  query: string
  activeMatch: JsonSearchMatch | null
  onToggle: (path: string) => void
  actions: JsonRowActionHandlers
}

export function JsonTreeView({
  result,
  expansion,
  showLineNumbers,
  query,
  activeMatch,
  onToggle,
  actions
}: JsonTreeViewProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const parsedValue = result.status === 'ok' ? result.value : undefined
  const hasValue = result.status === 'ok'
  // Why: the 5 MiB input ceiling makes a full rebuild per keystroke or scroll the
  // dominant cost; expansion helpers return fresh objects, so identity is enough.
  const rows = useMemo(
    () => (hasValue ? buildVisibleJsonRows(parsedValue, expansion) : NO_ROWS),
    [hasValue, parsedValue, expansion]
  )
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => JSON_TREE_ROW_HEIGHT,
    overscan: JSON_TREE_ROW_OVERSCAN
  })
  const activeMatchPath = activeMatch?.path ?? null
  // Why: virtualizer identity changes every render, so the effect must dedupe itself or it re-scrolls forever.
  const lastScrollKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeMatchPath === null) {
      lastScrollKeyRef.current = null
      return
    }
    const index = rows.findIndex((row) => row.path === activeMatchPath)
    if (index === -1) {
      return
    }
    const scrollKey = `${activeMatchPath}:${rows.length}:${index}`
    if (lastScrollKeyRef.current === scrollKey) {
      return
    }
    lastScrollKeyRef.current = scrollKey
    virtualizer.scrollToIndex(index, { align: 'center' })
  }, [activeMatchPath, rows, virtualizer])

  if (result.status === 'empty') {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.jsonFormatter.tree.empty.8c31d70b45',
          'Paste JSON on the left to preview it here.'
        )}
      </div>
    )
  }

  if (result.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
        {describeJsonParseError(result)}
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto py-2 scrollbar-sleek">
      <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index]
          if (!row) {
            return null
          }
          return (
            <div
              key={row.path}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <JsonTreeRow
                row={row}
                // Why: the virtual index is the row's absolute position, which is what
                // the line number means — the render window must not shift it.
                lineNumber={showLineNumbers ? virtualItem.index + 1 : null}
                query={query}
                activeMatch={activeMatch}
                onToggle={onToggle}
                actions={actions}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
