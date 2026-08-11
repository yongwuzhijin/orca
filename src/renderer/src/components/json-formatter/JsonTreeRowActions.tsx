import { Braces, Copy, Route, Trash2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { JsonTreeRow } from './json-tree-rows'

export type JsonRowActionHandlers = {
  onCopyPair: (row: JsonTreeRow) => void
  onCopyPath: (path: string) => void
  onCopyValue: (row: JsonTreeRow) => void
  onDelete: (row: JsonTreeRow) => void
}

type JsonTreeRowActionsProps = JsonRowActionHandlers & {
  row: JsonTreeRow
}

type ActionButtonProps = {
  label: string
  icon: React.JSX.Element
  onClick: () => void
}

// Why: not Radix Tooltip — one instance per row per action is far too much for a virtual list.
function ActionButton({ label, icon, onClick }: ActionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex size-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export function JsonTreeRowActions({
  row,
  onCopyPair,
  onCopyPath,
  onCopyValue,
  onDelete
}: JsonTreeRowActionsProps): React.JSX.Element {
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      data-testid="json-tree-row-actions"
    >
      <ActionButton
        label={translate('auto.components.jsonFormatter.rowActions.copy.3f1a7c9d05', 'Copy')}
        icon={<Copy className="size-3" />}
        onClick={() => onCopyPair(row)}
      />
      <ActionButton
        label={translate(
          'auto.components.jsonFormatter.rowActions.copyPath.8b6e2d4a71',
          'Copy path'
        )}
        icon={<Route className="size-3" />}
        onClick={() => onCopyPath(row.path)}
      />
      <ActionButton
        label={translate(
          'auto.components.jsonFormatter.rowActions.copyValue.c40d9e5b28',
          'Copy value'
        )}
        icon={<Braces className="size-3" />}
        onClick={() => onCopyValue(row)}
      />
      {row.segments.length > 0 && (
        <ActionButton
          label={translate(
            'auto.components.jsonFormatter.rowActions.delete.5a2f81c6b3',
            'Delete node'
          )}
          icon={<Trash2 className="size-3" />}
          onClick={() => onDelete(row)}
        />
      )}
    </div>
  )
}
