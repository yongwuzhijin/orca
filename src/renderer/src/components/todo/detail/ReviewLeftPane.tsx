import React from 'react'
import { translate } from '@/i18n/i18n'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SourceControlPanel } from '@/components/right-sidebar/source-control/panel/panel'
import { ReviewBrowserPane } from './ReviewBrowserPane'
import { ReviewFilePane } from './ReviewFilePane'
import { ReviewEmbeddedWorktreeProvider } from './review-embedded-worktree-context'
import { useTaskReviewWorktreeId } from './use-task-review-worktree-id'
import type { TodoItem } from '../../../../../shared/todo/todo-item'

type ReviewLeftPaneProps = {
  item: TodoItem
}

type ReviewTab = 'browser' | 'changes' | 'files'

function ReviewWorktreeEmptyState(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
      {translate(
        'auto.components.todo.detail.ReviewLeftPane.noWorktree',
        'Start the task in a workspace to review changes and files here.'
      )}
    </div>
  )
}

export function ReviewLeftPane({ item }: ReviewLeftPaneProps): React.JSX.Element {
  const worktreeId = useTaskReviewWorktreeId(item)
  const [tab, setTab] = React.useState<ReviewTab>('browser')

  return (
    <ReviewEmbeddedWorktreeProvider worktreeId={worktreeId}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border">
        <Tabs value={tab} onValueChange={(next) => setTab(next as ReviewTab)} className="gap-0">
          <div className="border-b border-border px-2 pt-2">
            <TabsList variant="line" className="h-8">
              <TabsTrigger value="browser">
                {translate('auto.components.todo.detail.ReviewLeftPane.tabBrowser', 'Browser')}
              </TabsTrigger>
              <TabsTrigger value="changes">
                {translate('auto.components.todo.detail.ReviewLeftPane.tabChanges', 'Changes')}
              </TabsTrigger>
              <TabsTrigger value="files">
                {translate('auto.components.todo.detail.ReviewLeftPane.tabFiles', 'Files')}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'browser' ? (
            <ReviewBrowserPane taskId={item.id} worktreeId={worktreeId} />
          ) : worktreeId ? (
            tab === 'changes' ? (
              <SourceControlPanel />
            ) : (
              <ReviewFilePane />
            )
          ) : (
            <ReviewWorktreeEmptyState />
          )}
        </div>
      </div>
    </ReviewEmbeddedWorktreeProvider>
  )
}
