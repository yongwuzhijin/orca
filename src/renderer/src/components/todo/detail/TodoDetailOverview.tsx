import React from 'react'
import MarkdownPreview from '@/components/editor/MarkdownPreview'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

type TodoDetailOverviewProps = {
  item: TodoItem
}

export function TodoDetailOverview({ item }: TodoDetailOverviewProps): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
      <MarkdownPreview
        content={item.description || '_No description_'}
        filePath={`todo/${item.id}.md`}
        scrollCacheKey={`todo-detail:${item.id}`}
      />
    </div>
  )
}
