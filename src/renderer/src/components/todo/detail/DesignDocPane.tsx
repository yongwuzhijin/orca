import { RefreshCw } from 'lucide-react'
import React from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { translate } from '@/i18n/i18n'
import { joinPath } from '@/lib/path'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import { useDesignDocFiles } from './use-design-doc-files'

type DesignDocPaneProps = {
  item: TodoItem
}

export function DesignDocPane({ item }: DesignDocPaneProps): React.JSX.Element {
  const { dirPath, connectionId, names, loading, refresh } = useDesignDocFiles(item)
  const [selected, setSelected] = React.useState<string | null>(null)
  const [body, setBody] = React.useState('')

  const active = selected && names.includes(selected) ? selected : (names[0] ?? null)

  React.useEffect(() => {
    if (!active) {
      setBody('')
      return
    }
    let cancelled = false
    void window.api.fs
      .readFile({ filePath: joinPath(dirPath, active), connectionId })
      // Why: a remote relay hands back base64 for a .md it judges binary; keep it out of the renderer.
      .then((res) => (cancelled ? null : setBody(res.isBinary ? '' : res.content)))
      .catch(() => (cancelled ? null : setBody('')))
    return () => {
      cancelled = true
    }
  }, [active, dirPath, connectionId])

  if (!loading && names.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-md border border-border p-6 text-center text-xs text-muted-foreground">
        <span>
          {translate(
            'auto.components.todo.detail.designDocs.empty',
            'No design documents yet. They appear here once the skill writes them.'
          )}
        </span>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="mr-1 size-3" />
          {translate('auto.components.todo.detail.designDocs.refresh', 'Refresh')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border p-2">
        {names.map((name) => (
          <Button
            key={name}
            variant={name === active ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0 text-xs"
            onClick={() => setSelected(name)}
          >
            {name}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onClick={refresh}
          aria-label={translate('auto.components.todo.detail.designDocs.refresh', 'Refresh')}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <CommentMarkdown content={body} variant="document" className="p-3" />
      </ScrollArea>
    </div>
  )
}
