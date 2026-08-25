import React from 'react'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { DesignDocPane } from './DesignDocPane'
import { InProgressPanel } from './InProgressPanel'
import type { DesignDocFiles } from './use-design-doc-files'

type SolutionDesignPanelProps = {
  item: TodoItem
  docFiles: DesignDocFiles
}

// Documents (left) + design conversation reused from In Progress (right).
// Why: Start implementation lives in the detail property rail, next to the other decisions.
export function SolutionDesignPanel({
  item,
  docFiles
}: SolutionDesignPanelProps): React.JSX.Element {
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-4">
      <DesignDocPane docFiles={docFiles} />
      <div
        data-testid="design-conversation"
        className="min-h-0 overflow-hidden rounded-md border border-border p-3"
      >
        <InProgressPanel item={item} showPlan={false} />
      </div>
    </div>
  )
}
