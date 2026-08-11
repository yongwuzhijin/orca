import { translate } from '@/i18n/i18n'
import { clampSplitRatio } from './json-formatter-split-ratio'

type JsonFormatterSplitterProps = {
  containerRef: React.RefObject<HTMLDivElement | null>
  onRatioChange: (ratio: number) => void
}

export function JsonFormatterSplitter({
  containerRef,
  onRatioChange
}: JsonFormatterSplitterProps): React.JSX.Element {
  const updateFromClientX = (clientX: number): void => {
    const container = containerRef.current
    if (!container) {
      return
    }
    // Why: measured per move, not captured on pointerdown, so a resize or a
    // sidebar toggle mid-drag cannot pin the ratio to stale bounds.
    const bounds = container.getBoundingClientRect()
    if (bounds.width === 0) {
      return
    }
    onRatioChange(clampSplitRatio((clientX - bounds.left) / bounds.width))
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={translate('auto.components.jsonFormatter.splitter.0b7ac31e59', 'Resize panes')}
      className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50"
      // Why: pointer capture keeps the drag scoped to this element, so it needs
      // no window listeners and cannot leak them if the pane unmounts mid-drag.
      onPointerDown={(event) => {
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          return
        }
        updateFromClientX(event.clientX)
      }}
    />
  )
}
