import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { HighlightedText } from './HighlightedText'
import { formatJsonContainerText, formatJsonRowLabel, formatJsonScalarText } from './json-row-text'
import {
  type JsonSearchField,
  type JsonSearchMatch,
  type JsonTextRange,
  findTextRanges
} from './json-search'
import type { JsonTreeRow as JsonTreeRowData } from './json-tree-rows'
import { type JsonRowActionHandlers, JsonTreeRowActions } from './JsonTreeRowActions'

const NO_RANGES: JsonTextRange[] = []

const VALUE_COLOR_BY_KIND: Record<JsonTreeRowData['kind'], string> = {
  object: 'text-json-punctuation',
  array: 'text-json-punctuation',
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-boolean',
  null: 'text-json-null'
}

function activeRangeFor(
  row: JsonTreeRowData,
  activeMatch: JsonSearchMatch | null,
  field: JsonSearchField
): JsonTextRange | null {
  if (activeMatch === null || activeMatch.path !== row.path || activeMatch.field !== field) {
    return null
  }
  return { start: activeMatch.start, end: activeMatch.end }
}

type JsonTreeRowProps = {
  row: JsonTreeRowData
  lineNumber: number | null
  query: string
  activeMatch: JsonSearchMatch | null
  onToggle: (path: string) => void
  actions: JsonRowActionHandlers
}

export function JsonTreeRow({
  row,
  lineNumber,
  query,
  activeMatch,
  onToggle,
  actions
}: JsonTreeRowProps): React.JSX.Element {
  const isContainer = row.kind === 'object' || row.kind === 'array'
  const labelText =
    row.label === null
      ? null
      : formatJsonRowLabel(row.label, row.labelKind === 'index' ? 'index' : 'key')
  const valueText = isContainer
    ? formatJsonContainerText(row.kind, row.childCount)
    : formatJsonScalarText(row.value, row.kind)
  // Why: an index is structure, not content — searching it would match every long array.
  const isSearchableLabel = labelText !== null && row.labelKind === 'key'
  const labelRanges = useMemo(
    () => (isSearchableLabel ? findTextRanges(labelText ?? '', query) : NO_RANGES),
    [isSearchableLabel, labelText, query]
  )
  // Why: a container renders `{ … }  8`, which is chrome — highlighting inside it means nothing.
  const valueRanges = useMemo(
    () => (isContainer ? NO_RANGES : findTextRanges(valueText, query)),
    [isContainer, valueText, query]
  )
  const toggleLabel = row.isCollapsed
    ? translate('auto.components.jsonFormatter.tree.expand.b4d9e10c73', 'Expand node')
    : translate('auto.components.jsonFormatter.tree.collapse.5f28a6c1de', 'Collapse node')
  return (
    <div
      className="group flex items-start gap-1 font-mono text-[13px] leading-[22px]"
      data-testid="json-tree-row"
    >
      {lineNumber !== null && (
        <span
          className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground"
          data-testid="json-tree-line-number"
        >
          {lineNumber}
        </span>
      )}
      <span className="shrink-0" style={{ paddingLeft: `${row.depth * 12}px` }} />
      {row.isExpandable ? (
        <button
          type="button"
          className="mt-1 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
          aria-label={toggleLabel}
          aria-expanded={!row.isCollapsed}
          onClick={() => onToggle(row.path)}
        >
          {row.isCollapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>
      ) : (
        <span className="mt-1 size-3 shrink-0" />
      )}
      <div className="min-w-0 flex-1 truncate rounded px-1 group-hover:bg-accent">
        {labelText !== null && (
          <>
            <span
              className={
                row.labelKind === 'index' ? 'text-json-punctuation' : 'font-semibold text-json-key'
              }
            >
              <HighlightedText
                text={labelText}
                ranges={labelRanges}
                activeRange={activeRangeFor(row, activeMatch, 'key')}
              />
            </span>
            <span className="text-json-punctuation">{': '}</span>
          </>
        )}
        <span
          className={cn(VALUE_COLOR_BY_KIND[row.kind], row.kind === 'string' && 'font-semibold')}
        >
          <HighlightedText
            text={valueText}
            ranges={valueRanges}
            activeRange={activeRangeFor(row, activeMatch, 'value')}
          />
        </span>
      </div>
      <JsonTreeRowActions row={row} {...actions} />
    </div>
  )
}
