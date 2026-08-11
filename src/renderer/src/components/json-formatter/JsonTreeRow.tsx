import { ChevronDown, ChevronRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { formatJsonContainerText, formatJsonRowLabel, formatJsonScalarText } from './json-row-text'
import type { JsonTreeRow as JsonTreeRowData } from './json-tree-rows'

const VALUE_COLOR_BY_KIND: Record<JsonTreeRowData['kind'], string> = {
  object: 'text-json-punctuation',
  array: 'text-json-punctuation',
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-boolean',
  null: 'text-json-null'
}

type JsonTreeRowProps = {
  row: JsonTreeRowData
  lineNumber: number | null
  onToggle: (path: string) => void
  onCopyPath: (path: string) => void
}

export function JsonTreeRow({
  row,
  lineNumber,
  onToggle,
  onCopyPath
}: JsonTreeRowProps): React.JSX.Element {
  const isContainer = row.kind === 'object' || row.kind === 'array'
  const toggleLabel = row.isCollapsed
    ? translate('auto.components.jsonFormatter.tree.expand.b4d9e10c73', 'Expand node')
    : translate('auto.components.jsonFormatter.tree.collapse.5f28a6c1de', 'Collapse node')
  return (
    <div className="flex items-start gap-1 font-mono text-xs leading-5" data-testid="json-tree-row">
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
          className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
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
        <span className="mt-0.5 size-3 shrink-0" />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left hover:bg-accent"
        onClick={() => onCopyPath(row.path)}
      >
        {row.label !== null && (
          <>
            <span className={row.labelKind === 'index' ? 'text-json-punctuation' : 'text-json-key'}>
              {formatJsonRowLabel(row.label, row.labelKind === 'index' ? 'index' : 'key')}
            </span>
            <span className="text-json-punctuation">{': '}</span>
          </>
        )}
        <span className={cn(VALUE_COLOR_BY_KIND[row.kind])}>
          {isContainer
            ? formatJsonContainerText(row.kind, row.childCount)
            : formatJsonScalarText(row.value, row.kind)}
        </span>
      </button>
    </div>
  )
}
