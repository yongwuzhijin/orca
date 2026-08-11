import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { translate } from '@/i18n/i18n'
import { describeJsonParseError } from './json-parse-error-message'
import { JsonTreeRow } from './JsonTreeRow'
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
  onToggle: (path: string) => void
  onCopyPath: (path: string) => void
}

export function JsonTreeView({
  result,
  expansion,
  showLineNumbers,
  onToggle,
  onCopyPath
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
                onToggle={onToggle}
                onCopyPath={onCopyPath}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
