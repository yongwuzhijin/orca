import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [filter, setFilter] = useState('')
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

  const needle = filter.trim().toLowerCase()
  const visible = useMemo(
    () =>
      needle === ''
        ? entries
        : // Method is matched alongside the URL so a bare verb like "post" narrows the list.
          entries.filter(
            (entry) =>
              entry.url.toLowerCase().includes(needle) ||
              entry.method.toLowerCase().includes(needle)
          ),
    [entries, needle]
  )

  const filterLabel = translate('browser.networkTools.logFilter', 'Filter requests')

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7" onClick={() => void refresh()}>
          <RefreshCw className="mr-1 h-3 w-3" />
          {translate('browser.networkTools.refresh', 'Refresh')}
        </Button>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label={filterLabel}
            placeholder={filterLabel}
            className="h-7 pl-7 text-xs"
          />
        </div>
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
      {entries.length > 0 && visible.length === 0 ? (
        <p className="text-muted-foreground">
          {translate('browser.networkTools.logFilterEmpty', 'No requests match this filter.')}
        </p>
      ) : null}
      {visible.map((entry) => (
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
