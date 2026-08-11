import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'

type JsonSearchBarProps = {
  query: string
  matchCount: number
  activeMatchIndex: number
  onQueryChange: (query: string) => void
  onMoveToMatch: (direction: 1 | -1) => void
}

export function JsonSearchBar({
  query,
  matchCount,
  activeMatchIndex,
  onQueryChange,
  onMoveToMatch
}: JsonSearchBarProps): React.JSX.Element {
  const hasQuery = query.length > 0
  const counter =
    matchCount > 0
      ? `${activeMatchIndex + 1}/${matchCount}`
      : translate('auto.components.jsonFormatter.search.noResults.38c7b5f4e1', 'No results')
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1"
      // Why: the pane lives inside the global shortcut scope, and typing `f` here is text, not a command.
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Input
        value={query}
        className="h-7 flex-1 text-xs"
        placeholder={translate(
          'auto.components.jsonFormatter.search.placeholder.4b8d16e7c2',
          'Search keys and values'
        )}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onMoveToMatch(event.shiftKey ? -1 : 1)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onQueryChange('')
          }
        }}
      />
      {hasQuery && (
        <span
          className="shrink-0 px-1 text-xs text-muted-foreground"
          data-testid="json-search-count"
        >
          {counter}
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={translate(
          'auto.components.jsonFormatter.search.previous.0d9f42a6b8',
          'Previous match'
        )}
        disabled={matchCount === 0}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onMoveToMatch(-1)}
      >
        <ChevronUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={translate('auto.components.jsonFormatter.search.next.a75e3c1d90', 'Next match')}
        disabled={matchCount === 0}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onMoveToMatch(1)}
      >
        <ChevronDown className="size-3.5" />
      </Button>
    </div>
  )
}
