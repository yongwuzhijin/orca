import { translate } from '@/i18n/i18n'
import { describeJsonParseError } from './json-parse-error-message'
import { JsonTreeRow } from './JsonTreeRow'
import { buildVisibleJsonRows } from './json-tree-rows'
import type { JsonExpansionState } from './json-tree-expansion'
import type { JsonParseResult } from './parse-json-input'

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

  const rows = buildVisibleJsonRows(result.value, expansion)

  return (
    <div className="h-full overflow-auto py-2 scrollbar-sleek">
      {rows.map((row, index) => (
        <JsonTreeRow
          key={row.path}
          row={row}
          lineNumber={showLineNumbers ? index + 1 : null}
          onToggle={onToggle}
          onCopyPath={onCopyPath}
        />
      ))}
    </div>
  )
}
