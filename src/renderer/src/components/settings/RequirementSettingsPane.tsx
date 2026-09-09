import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { DEFAULT_CLARIFICATION_TEMPLATE_BODY } from '../../../../shared/todo/todo-clarification-template'
import { consumeRequirementSettingsTab } from '@/components/todo/open-requirement-settings'
import { RequirementTemplateListEditor } from './RequirementTemplateListEditor'

export function RequirementSettingsPane(): React.JSX.Element {
  const [activeTab, setActiveTab] = React.useState<'start-task' | 'clarification'>(() =>
    consumeRequirementSettingsTab()
  )
  const todoTemplates = useAppStore((s) => s.todoTemplates)
  const todoClarificationTemplates = useAppStore((s) => s.todoClarificationTemplates)
  const loadTodoTemplates = useAppStore((s) => s.loadTodoTemplates)
  const loadTodoClarificationTemplates = useAppStore((s) => s.loadTodoClarificationTemplates)
  const createTodoTemplate = useAppStore((s) => s.createTodoTemplate)
  const updateTodoTemplate = useAppStore((s) => s.updateTodoTemplate)
  const deleteTodoTemplate = useAppStore((s) => s.deleteTodoTemplate)
  const createTodoClarificationTemplate = useAppStore((s) => s.createTodoClarificationTemplate)
  const updateTodoClarificationTemplate = useAppStore((s) => s.updateTodoClarificationTemplate)
  const deleteTodoClarificationTemplate = useAppStore((s) => s.deleteTodoClarificationTemplate)

  React.useEffect(() => {
    void loadTodoTemplates()
    void loadTodoClarificationTemplates()
  }, [loadTodoClarificationTemplates, loadTodoTemplates])

  return (
    <Tabs
      value={activeTab}
      onValueChange={(next) => setActiveTab(next as 'start-task' | 'clarification')}
    >
      <TabsList variant="line" className="mb-4 h-9">
        <TabsTrigger value="start-task">
          {translate(
            'auto.components.settings.RequirementSettingsPane.startTaskTab',
            'Start task templates'
          )}
        </TabsTrigger>
        <TabsTrigger value="clarification">
          {translate(
            'auto.components.settings.RequirementSettingsPane.clarificationTab',
            'Clarification templates'
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="start-task">
        <RequirementTemplateListEditor
          templates={todoTemplates}
          emptyLabel={translate(
            'auto.components.settings.RequirementSettingsPane.startTaskEmpty',
            'No start task templates yet.'
          )}
          onCreate={async (input) => {
            await createTodoTemplate(input)
          }}
          onUpdate={async (input) => {
            await updateTodoTemplate(input)
          }}
          onDelete={async (id) => {
            await deleteTodoTemplate(id)
          }}
        />
      </TabsContent>
      <TabsContent value="clarification">
        <RequirementTemplateListEditor
          templates={todoClarificationTemplates}
          emptyLabel={translate(
            'auto.components.settings.RequirementSettingsPane.clarificationEmpty',
            'No clarification templates yet.'
          )}
          onCreate={async (input) => {
            await createTodoClarificationTemplate({
              name: input.name,
              body: input.body.trim() ? input.body : DEFAULT_CLARIFICATION_TEMPLATE_BODY
            })
          }}
          onUpdate={async (input) => {
            await updateTodoClarificationTemplate(input)
          }}
          onDelete={async (id) => {
            await deleteTodoClarificationTemplate(id)
          }}
        />
      </TabsContent>
    </Tabs>
  )
}
