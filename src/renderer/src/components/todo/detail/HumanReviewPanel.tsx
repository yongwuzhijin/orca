// src/renderer/src/components/todo/detail/HumanReviewPanel.tsx
import React from 'react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { ReviewLeftPane } from './ReviewLeftPane'
import { InProgressPanel } from './InProgressPanel'

type HumanReviewPanelProps = {
  item: TodoItem
}

// Preview tabs (left) + verify conversation reused from In Progress (right).
// Why: Reject/Approve live in the detail property rail under Scheduled.
export function HumanReviewPanel({ item }: HumanReviewPanelProps): React.JSX.Element {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <ReviewLeftPane item={item} />
      <div
        data-testid="review-conversation"
        className="min-h-0 overflow-hidden rounded-md border border-border p-3"
      >
        <InProgressPanel item={item} showPlan={false} />
      </div>
    </div>
  )
}
