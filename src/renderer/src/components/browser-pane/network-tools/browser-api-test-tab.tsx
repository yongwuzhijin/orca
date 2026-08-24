import { useCallback, useEffect, useRef, useState } from 'react'
import { JsonFormatterSplitter } from '@/components/json-formatter/JsonFormatterSplitter'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { BrowserApiTestRequestForm } from './browser-api-test-request-form'
import { BrowserApiTestResponseView } from './browser-api-test-response-view'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'
import {
  applyBrowserApiTestQuery,
  splitBrowserApiTestQuery
} from '../../../../../shared/browser-api-test-query'
import type {
  BrowserApiTestKeyValueRow,
  BrowserApiTestResponse
} from '../../../../../shared/browser-api-test-types'

function defaultHeaders(): BrowserApiTestKeyValueRow[] {
  return [{ name: 'accept', value: '*/*', enabled: true }]
}

function createRequestId(): string {
  return `api-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function BrowserApiTestTab({
  browserPageId,
  sessionProfileId
}: {
  browserPageId: string
  sessionProfileId: string | null
}): React.JSX.Element {
  const prefill = useBrowserNetworkToolsPanel((s) => s.apiPrefill)
  const clearApiPrefill = useBrowserNetworkToolsPanel((s) => s.clearApiPrefill)
  const [method, setMethod] = useState('GET')
  const [url, setUrl] = useState('')
  const [params, setParams] = useState<BrowserApiTestKeyValueRow[]>([])
  const [headers, setHeaders] = useState<BrowserApiTestKeyValueRow[]>(defaultHeaders)
  const [body, setBody] = useState('')
  const [response, setResponse] = useState<BrowserApiTestResponse | null>(null)
  const [sending, setSending] = useState(false)
  const [ratio, setRatio] = useState(0.5)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingIdRef = useRef<string | null>(null)

  // Why: the prefill is one-shot — clearing it on arrival stops a later re-render from
  // stomping edits the user made after "Send from log" seeded the form.
  useEffect(() => {
    if (!prefill) {
      return
    }
    setMethod(prefill.method)
    const split = splitBrowserApiTestQuery(prefill.url)
    setUrl(split.url)
    setParams(split.params)
    setHeaders(prefill.headers.length > 0 ? prefill.headers : defaultHeaders())
    // Why: a prefill describes a whole request, so a body typed for the previous one does not
    // belong to this URL.
    setBody('')
    setResponse(null)
    clearApiPrefill()
  }, [prefill, clearApiPrefill])

  // Why here and not in the form: a paste that never lost focus leaves the query in the URL field,
  // and lifting it out on send would race the send itself.
  const commitUrlQuery = useCallback((): void => {
    const split = splitBrowserApiTestQuery(url)
    if (split.params.length === 0 && split.url === url) {
      return
    }
    setUrl(split.url)
    setParams((current) => [...current, ...split.params])
  }, [url])

  const send = useCallback(async (): Promise<void> => {
    const requestId = createRequestId()
    pendingIdRef.current = requestId
    setSending(true)
    setResponse(null)
    const result = await window.api.browser.networkSendRequest({
      request: {
        browserPageId,
        requestId,
        method,
        url: applyBrowserApiTestQuery(url, params),
        headers,
        body
      }
    })
    // Why: a second Send supersedes the first, so a late reply from the abandoned
    // request must not overwrite what is on screen now.
    if (pendingIdRef.current !== requestId) {
      return
    }
    pendingIdRef.current = null
    setSending(false)
    setResponse(result)
  }, [browserPageId, method, url, params, headers, body])

  // Why pendingIdRef survives: main always resolves the send, with an aborted result, and letting
  // that land is the user's confirmation. Only `sending` is released, so Send is usable again
  // without waiting for the abort to round-trip — which is what the supersede guard above is for.
  const cancel = useCallback((): void => {
    const requestId = pendingIdRef.current
    if (!requestId) {
      return
    }
    setSending(false)
    void window.api.browser.networkCancelRequest({ requestId })
  }, [])

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      <div className="flex min-h-0 shrink-0 flex-col gap-2" style={{ width: `${ratio * 100}%` }}>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={sending || url.trim().length === 0}
            onClick={() => void send()}
          >
            {translate('browser.networkTools.apiSend', 'Send')}
          </Button>
          {sending ? (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancel}>
              {translate('browser.networkTools.apiCancel', 'Cancel')}
            </Button>
          ) : null}
          <span className="truncate text-[10px] text-muted-foreground">
            {translate('browser.networkTools.apiSessionProfile', 'Session: {{value}}', {
              value:
                sessionProfileId ?? translate('browser.networkTools.apiSessionDefault', 'default')
            })}
          </span>
        </div>
        <BrowserApiTestRequestForm
          method={method}
          url={url}
          params={params}
          headers={headers}
          body={body}
          onMethodChange={setMethod}
          onUrlChange={setUrl}
          onUrlCommit={commitUrlQuery}
          onParamsChange={setParams}
          onHeadersChange={setHeaders}
          onBodyChange={setBody}
        />
      </div>
      <JsonFormatterSplitter containerRef={containerRef} onRatioChange={setRatio} />
      <div className="flex min-h-0 flex-1 flex-col pl-2">
        <BrowserApiTestResponseView response={response} />
      </div>
    </div>
  )
}
