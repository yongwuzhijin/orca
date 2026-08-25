import React from 'react'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { EnterInProgressDialog } from './EnterInProgressDialog'
import type { DesignDocFiles } from './use-design-doc-files'

type StartImplementationButtonProps = {
  item: TodoItem
  docFiles: DesignDocFiles
}

// Why: reuses the start dialog so cwd/engine plumbing stays in one place; the docs feed the handoff prompt.
export function StartImplementationButton({
  item,
  docFiles
}: StartImplementationButtonProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button size="sm" className="w-full justify-center" onClick={() => setOpen(true)}>
        <Play className="mr-1 size-4" />
        {translate('auto.components.todo.detail.startImplementation', 'Start implementation')}
      </Button>
      {open ? (
        <EnterInProgressDialog
          item={item}
          mode="from-design"
          designDocNames={docFiles.names}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
