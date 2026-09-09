import React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { TodoDetailOverview } from './TodoDetailOverview'
import { RequirementPrdPane } from './RequirementPrdPane'
import { RequirementClarificationPane } from './RequirementClarificationPane'
import { RequirementPrdSupplementPane } from './RequirementPrdSupplementPane'
import { ReviewEmbeddedWorktreeProvider } from './review-embedded-worktree-context'
import { useRequirementWorktreeId } from './use-requirement-worktree-id'

type RequirementTab = 'overview' | 'prd' | 'clarification' | 'supplement'

type TodoRequirementPanelProps = {
  item: TodoItem
}

export function TodoRequirementPanel({ item }: TodoRequirementPanelProps): React.JSX.Element {
  const worktreeId = useRequirementWorktreeId(item)
  const [tab, setTab] = React.useState<RequirementTab>('overview')

  return (
    <ReviewEmbeddedWorktreeProvider worktreeId={worktreeId}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Tabs value={tab} onValueChange={(next) => setTab(next as RequirementTab)}>
          <TabsList variant="line" className="h-8">
            <TabsTrigger value="overview">
              {translate(
                'auto.components.todo.detail.TodoRequirementPanel.tabOverview',
                'Requirement'
              )}
            </TabsTrigger>
            <TabsTrigger value="prd">
              {translate('auto.components.todo.detail.TodoRequirementPanel.tabPrd', 'PRD')}
            </TabsTrigger>
            <TabsTrigger value="clarification">
              {translate(
                'auto.components.todo.detail.TodoRequirementPanel.tabClarification',
                'Clarification'
              )}
            </TabsTrigger>
            <TabsTrigger value="supplement">
              {translate(
                'auto.components.todo.detail.TodoRequirementPanel.tabSupplement',
                'PRD supplement'
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'overview' ? (
            <TodoDetailOverview item={item} />
          ) : tab === 'prd' ? (
            <RequirementPrdPane item={item} />
          ) : tab === 'clarification' ? (
            <RequirementClarificationPane item={item} />
          ) : (
            <RequirementPrdSupplementPane item={item} />
          )}
        </div>
      </div>
    </ReviewEmbeddedWorktreeProvider>
  )
}
