import { JsonFormatterInput } from '@/components/json-formatter/JsonFormatterInput'
import { NativeChatCopyButton } from '@/components/native-chat/NativeChatCopyButton'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  BrowserApiTestFailureReason,
  BrowserApiTestResponse
} from '../../../../../shared/browser-api-test-types'

function statusToneClass(statusCode: number): string {
  if (statusCode >= 500) {
    return 'text-destructive'
  }
  if (statusCode >= 400) {
    return 'text-amber-600'
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'text-status-success'
  }
  return 'text-foreground'
}

// Why: the main process reports failures as English diagnostics, so the reason code — not the
// message — is what the UI is allowed to speak from.
function failureHeadline(reason: BrowserApiTestFailureReason): string {
  switch (reason) {
    case 'invalid_url':
      return translate('browser.networkTools.apiFailedInvalidUrl', 'Enter an http or https URL.')
    case 'invalid_method':
      return translate(
        'browser.networkTools.apiFailedInvalidMethod',
        'That HTTP method is not supported.'
      )
    case 'no_guest':
      return translate(
        'browser.networkTools.apiFailedNoGuest',
        'This tab has no live page to borrow a session from.'
      )
    case 'busy':
      return translate(
        'browser.networkTools.apiFailedBusy',
        'A request is already in flight for this tab.'
      )
    case 'timeout':
      return translate(
        'browser.networkTools.apiFailedTimeout',
        'Request timed out after 30 seconds.'
      )
    case 'aborted':
      return translate('browser.networkTools.apiFailedAborted', 'Request canceled.')
    case 'network':
      return translate(
        'browser.networkTools.apiFailedNetwork',
        'The request could not be completed.'
      )
  }
}

function headerLines(headers: Record<string, string[]>): { name: string; value: string }[] {
  return Object.entries(headers).flatMap(([name, values]) =>
    values.map((value) => ({ name, value }))
  )
}

function durationText(durationMs: number): string {
  return translate('browser.networkTools.logDuration', '{{value}} ms', { value: durationMs })
}

export function BrowserApiTestResponseView({
  response
}: {
  response: BrowserApiTestResponse | null
}): React.JSX.Element | null {
  if (!response) {
    return null
  }

  if (response.status === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <p className="font-medium text-destructive">{failureHeadline(response.reason)}</p>
        {response.message ? (
          <p className="break-all font-mono text-[11px] text-muted-foreground">
            {response.message}
          </p>
        ) : null}
        <p className="text-muted-foreground">{durationText(response.durationMs)}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className={cn('font-mono font-medium', statusToneClass(response.statusCode))}>
          {response.statusCode}
        </span>
        <span className="text-muted-foreground">{response.statusMessage}</span>
        <span className="text-muted-foreground">{durationText(response.durationMs)}</span>
        {response.textual ? (
          <NativeChatCopyButton
            text={response.body}
            label={translate('browser.networkTools.copyResponseBody', 'Copy response body')}
          />
        ) : null}
      </div>
      {response.truncated ? (
        <p className="text-amber-600">
          {translate(
            'browser.networkTools.responseTruncated',
            'Body truncated at 2 MB — {{value}} bytes reported.',
            { value: response.bodyBytes }
          )}
        </p>
      ) : null}
      <div className="scrollbar-sleek max-h-24 shrink-0 overflow-auto">
        {headerLines(response.headers).map((line, index) => (
          // Why index: header lines have no identity of their own and never reorder.
          <div key={index} className="flex gap-1.5 font-mono text-[11px]">
            <span className="shrink-0 text-muted-foreground">{line.name}</span>
            <span className="break-all">{line.value}</span>
          </div>
        ))}
      </div>
      {response.textual ? (
        <div className="min-h-0 flex-1">
          <JsonFormatterInput value={response.body} readOnly language="plaintext" />
        </div>
      ) : (
        <p className="text-muted-foreground">
          {translate(
            'browser.networkTools.responseBinary',
            'Binary response not shown — {{value}} bytes.',
            { value: response.bodyBytes }
          )}
        </p>
      )}
    </div>
  )
}
