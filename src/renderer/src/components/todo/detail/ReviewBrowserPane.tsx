import React from 'react'
import { RotateCw, ChevronLeft, ChevronRight, Monitor, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { WorkspacePort } from '../../../../../shared/workspace-ports'
import { portToPreviewUrl } from './review-port-url'
import { ensureReviewWebview } from './review-webview'

type ReviewBrowserPaneProps = {
  taskId: string
}

export function ReviewBrowserPane({ taskId }: ReviewBrowserPaneProps): React.JSX.Element {
  const [ports, setPorts] = React.useState<WorkspacePort[]>([])
  const [url, setUrl] = React.useState('')
  const [mobile, setMobile] = React.useState(false)
  const viewportRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void window.api.todos.review.scanPorts({ taskId }).then((detected) => {
      if (cancelled) {
        return
      }
      setPorts(detected)
      if (detected.length > 0) {
        setUrl(portToPreviewUrl(detected[0]))
      }
    })
    return () => {
      cancelled = true
    }
  }, [taskId])

  React.useEffect(() => {
    const container = viewportRef.current
    if (!container || !url) {
      return
    }
    ensureReviewWebview({ container, taskId, url, mobile })
  }, [taskId, url, mobile])

  const webview = (): Electron.WebviewTag | null =>
    (viewportRef.current?.querySelector('webview') as Electron.WebviewTag | null) ?? null

  const reload = (): void => {
    const wv = webview()
    if (wv && typeof wv.reload === 'function') {
      wv.reload()
    }
  }
  const back = (): void => {
    const wv = webview()
    if (wv && typeof wv.goBack === 'function') {
      wv.goBack()
    }
  }
  const forward = (): void => {
    const wv = webview()
    if (wv && typeof wv.goForward === 'function') {
      wv.goForward()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
        <Button
          size="icon"
          variant="ghost"
          onClick={back}
          aria-label={translate('auto.components.todo.detail.ReviewBrowserPane.back', 'Back')}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={forward}
          aria-label={translate('auto.components.todo.detail.ReviewBrowserPane.forward', 'Forward')}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={reload}
          aria-label={translate('auto.components.todo.detail.ReviewBrowserPane.reload', 'Reload')}
        >
          <RotateCw className="size-4" />
        </Button>
        <Input
          value={url}
          placeholder={translate(
            'auto.components.todo.detail.ReviewBrowserPane.urlPlaceholder',
            'http://localhost:...'
          )}
          onChange={(e) => setUrl(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
        {ports.length > 1 ? (
          <select
            className="h-7 rounded border border-border bg-background text-xs"
            onChange={(e) => setUrl(e.target.value)}
            value={url}
          >
            {ports.map((p) => {
              const u = portToPreviewUrl(p)
              return (
                <option key={p.id} value={u}>
                  {u}
                </option>
              )
            })}
          </select>
        ) : null}
        <Button
          size="icon"
          variant={mobile ? 'ghost' : 'secondary'}
          aria-label={translate('auto.components.todo.detail.ReviewBrowserPane.desktop', 'Desktop')}
          aria-pressed={!mobile}
          onClick={() => setMobile(false)}
        >
          <Monitor className="size-4" />
        </Button>
        <Button
          size="icon"
          variant={mobile ? 'secondary' : 'ghost'}
          aria-label={translate('auto.components.todo.detail.ReviewBrowserPane.mobile', 'Mobile')}
          aria-pressed={mobile}
          onClick={() => setMobile(true)}
        >
          <Smartphone className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-muted">
        <div
          ref={viewportRef}
          className="flex min-h-0 flex-1"
          style={mobile ? { maxWidth: '390px' } : undefined}
        />
      </div>
    </div>
  )
}
