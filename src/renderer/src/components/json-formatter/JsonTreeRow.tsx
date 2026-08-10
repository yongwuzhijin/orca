import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { JsonTreeRow as JsonTreeRowData } from './json-tree-rows'

const VALUE_COLOR_BY_KIND: Record<JsonTreeRowData['kind'], string> = {
  object: 'text-json-punctuation',
  array: 'text-json-punctuation',
  string: 'text-json-string',
  number: 'text-json-number',
  boolean: 'text-json-boolean',
  null: 'text-json-null'
}

function formatScalar(row: JsonTreeRowData): string {
  switch (row.kind) {
    case 'string':
      return JSON.stringify(row.value)
    case 'null':
      return 'null'
    default:
      return String(row.value)
  }
}

function formatContainer(row: JsonTreeRowData): string {
  const [open, close] = row.kind === 'array' ? ['[', ']'] : ['{', '}']
  if (row.childCount === 0) {
    return `${open}${close}`
  }
  return `${open} … ${close}  ${row.childCount}`
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
  return (
    <div className="flex items-start gap-1 font-mono text-xs leading-5">
      {lineNumber !== null && (
        <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground">
          {lineNumber}
        </span>
      )}
      <span className="shrink-0" style={{ paddingLeft: `${row.depth * 12}px` }} />
      {row.isExpandable ? (
        <button
          type="button"
          className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
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
        className="min-w-0 flex-1 truncate rounded px-1 text-left hover:bg-accent"
        onClick={() => onCopyPath(row.path)}
      >
        {row.label !== null && (
          <>
            <span className={row.labelKind === 'index' ? 'text-json-punctuation' : 'text-json-key'}>
              {row.labelKind === 'index' ? row.label : `"${row.label}"`}
            </span>
            <span className="text-json-punctuation">{': '}</span>
          </>
        )}
        <span className={cn(VALUE_COLOR_BY_KIND[row.kind])}>
          {isContainer ? formatContainer(row) : formatScalar(row)}
        </span>
      </button>
    </div>
  )
}
