import { ChevronsDownUp, ChevronsUpDown, Copy, ListOrdered, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

type ToolbarAction = {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  disabled?: boolean
  active?: boolean
}

type JsonFormatterToolbarProps = {
  canFormat: boolean
  showLineNumbers: boolean
  keepEscapes: boolean
  onFormat: () => void
  onCollapseAll: () => void
  onExpandAll: () => void
  onToggleLineNumbers: () => void
  onToggleKeepEscapes: (value: boolean) => void
  onCopy: () => void
  onClear: () => void
}

export function JsonFormatterToolbar({
  canFormat,
  showLineNumbers,
  keepEscapes,
  onFormat,
  onCollapseAll,
  onExpandAll,
  onToggleLineNumbers,
  onToggleKeepEscapes,
  onCopy,
  onClear
}: JsonFormatterToolbarProps): React.JSX.Element {
  const actions: ToolbarAction[] = [
    {
      key: 'format',
      label: translate('auto.components.jsonFormatter.toolbar.format.1f9d4c8a02', 'Format'),
      icon: Wand2,
      onClick: onFormat,
      disabled: !canFormat
    },
    {
      key: 'collapse-all',
      label: translate(
        'auto.components.jsonFormatter.toolbar.collapseAll.7be2035dc1',
        'Collapse all'
      ),
      icon: ChevronsDownUp,
      onClick: onCollapseAll
    },
    {
      key: 'expand-all',
      label: translate('auto.components.jsonFormatter.toolbar.expandAll.4a70cbe9d8', 'Expand all'),
      icon: ChevronsUpDown,
      onClick: onExpandAll
    },
    {
      key: 'line-numbers',
      label: translate(
        'auto.components.jsonFormatter.toolbar.lineNumbers.d3016fb2a7',
        'Show line numbers'
      ),
      icon: ListOrdered,
      onClick: onToggleLineNumbers,
      active: showLineNumbers
    },
    {
      key: 'copy',
      label: translate(
        'auto.components.jsonFormatter.toolbar.copy.20b8ce4f95',
        'Copy formatted JSON'
      ),
      icon: Copy,
      onClick: onCopy,
      disabled: !canFormat
    },
    {
      key: 'clear',
      label: translate('auto.components.jsonFormatter.toolbar.clear.6ea5138c70', 'Clear input'),
      icon: Trash2,
      onClick: onClear
    }
  ]

  const keepEscapesLabel = translate(
    'auto.components.jsonFormatter.toolbar.keepEscapes.95c2eb70a4',
    'Keep escapes'
  )

  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1">
      {actions.map((action) => (
        <Tooltip key={action.key}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('size-7', action.active && 'bg-accent text-accent-foreground')}
              aria-label={action.label}
              aria-pressed={action.active}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              <action.icon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action.label}</TooltipContent>
        </Tooltip>
      ))}
      <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        {/* Why: the wrapping label already names it; an aria-label would only shadow that. */}
        <Checkbox
          checked={keepEscapes}
          onCheckedChange={(checked) => onToggleKeepEscapes(checked === true)}
        />
        {keepEscapesLabel}
      </label>
    </div>
  )
}
