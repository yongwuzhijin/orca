import { cn } from '@/lib/utils'
import type { JsonTextRange } from './json-search'

type HighlightedTextProps = {
  text: string
  ranges: readonly JsonTextRange[]
  activeRange: JsonTextRange | null
}

export function HighlightedText({
  text,
  ranges,
  activeRange
}: HighlightedTextProps): React.JSX.Element {
  if (ranges.length === 0) {
    return <>{text}</>
  }
  const parts: React.JSX.Element[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(<span key={`gap-${cursor}`}>{text.slice(cursor, range.start)}</span>)
    }
    const isActive = activeRange?.start === range.start && activeRange.end === range.end
    parts.push(
      <span
        key={`hit-${range.start}`}
        className={cn(
          'rounded-[2px]',
          isActive ? 'bg-search-match-active/60' : 'bg-search-match/50'
        )}
        data-testid="json-highlight"
      >
        {text.slice(range.start, range.end)}
      </span>
    )
    cursor = range.end
  }
  if (cursor < text.length) {
    parts.push(<span key={`gap-${cursor}`}>{text.slice(cursor)}</span>)
  }
  return <>{parts}</>
}
