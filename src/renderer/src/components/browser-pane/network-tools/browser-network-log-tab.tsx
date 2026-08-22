import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  browserApiTestHeaderRowsFromRecord,
  resolveBrowserApiTestTarget
} from '../../../../../shared/browser-api-test-target'
import type { BrowserNetworkLogEntry } from '../../../../../shared/browser-network-log-types'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

const READ_LIMIT = 100
const POLL_INTERVAL_MS = 1500

export function BrowserNetworkLogTab({
  browserPageId
}: {
  browserPageId: string
}): React.JSX.Element {
  const [entries, setEntries] = useState<BrowserNetworkLogEntry[]>([])
  const [truncated, setTruncated] = useState(false)
  const openApiTest = useBrowserNetworkToolsPanel((s) => s.openApiTest)
  // Why: bumped on teardown so a read issued for the previous page id cannot land on the new one.
  const generationRef = useRef(0)

  const refresh = useCallback(async () => {
    const generation = generationRef.current
    try {
      const read = await window.api.browser.networkReadLog({ browserPageId, limit: READ_LIMIT })
      if (generation !== generationRef.current) {
        return
      }
      setEntries(read.entries)
      setTruncated(read.truncated)
    } catch {
      // Keep the last good snapshot; a blip on one poll is not worth a persistent error state.
    }
  }, [browserPageId])

  useEffect(() => {
    void refresh()
    // Why: polling only while the tab is mounted beats a push channel that would need a
    // subscription lifecycle for a panel that is closed almost all of the time.
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => {
      generationRef.current += 1
      clearInterval(timer)
    }
  }, [refresh])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7" onClick={() => void refresh()}>
          <RefreshCw className="mr-1 h-3 w-3" />
          {translate('browser.networkTools.refresh', 'Refresh')}
        </Button>
        {truncated ? (
          <span className="text-[11px] text-muted-foreground">
            {translate('browser.networkTools.logTruncated', 'Showing the newest 100 requests.')}
          </span>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground">
          {translate(
            'browser.networkTools.logEmpty',
            'No requests recorded for this tab yet. Reload the page to capture traffic.'
          )}
        </p>
      ) : null}
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 font-mono text-[11px]">
          <span className="w-12 shrink-0 text-muted-foreground">{entry.method}</span>
          <span
            className={cn(
              'w-24 shrink-0 truncate',
              entry.error ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {entry.error ?? entry.statusCode ?? '—'}
          </span>
          <span className="w-16 shrink-0 text-muted-foreground">{entry.resourceType}</span>
          <span className="w-16 shrink-0 text-muted-foreground">
            {typeof entry.durationMs === 'number'
              ? translate('browser.networkTools.logDuration', '{{value}} ms', {
                  value: entry.durationMs
                })
              : '—'}
          </span>
          <span className="min-w-0 flex-1 truncate" title={entry.url}>
            {entry.url}
          </span>
          {/* Only http(s) can be replayed; the sender rejects anything else. */}
          {resolveBrowserApiTestTarget(entry.url) ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 shrink-0"
              aria-label={translate(
                'browser.networkTools.sendToApiTest',
                'Send this request in the API tab'
              )}
              onClick={() =>
                openApiTest(browserPageId, {
                  method: entry.method,
                  url: entry.url,
                  headers: browserApiTestHeaderRowsFromRecord(entry.requestHeaders)
                })
              }
            >
              <Send className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
