// src/renderer/src/components/todo/detail/HumanReviewPanel.tsx
import React from 'react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { ReviewBrowserPane } from './ReviewBrowserPane'
import { InProgressPanel } from './InProgressPanel'
import { ReviewDecisionBar } from './ReviewDecisionBar'

type HumanReviewPanelProps = {
  item: TodoItem
}

// Preview (left) + verify conversation reused from In Progress (right) + decision bar.
export function HumanReviewPanel({ item }: HumanReviewPanelProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <ReviewBrowserPane taskId={item.id} />
        <div className="min-h-0 overflow-hidden">
          <InProgressPanel item={item} />
        </div>
      </div>
      <ReviewDecisionBar item={item} />
    </div>
  )
}
