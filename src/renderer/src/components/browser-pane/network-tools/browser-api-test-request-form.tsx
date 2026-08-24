import { JsonFormatterInput } from '@/components/json-formatter/JsonFormatterInput'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import {
  BrowserApiTestKeyValueRows,
  type BrowserApiTestKeyValueLabels
} from './browser-api-test-key-value-rows'
import {
  browserApiTestMethodAllowsBody,
  normalizeBrowserApiTestMethod
} from '../../../../../shared/browser-api-test-target'
import {
  BROWSER_API_TEST_METHODS,
  type BrowserApiTestKeyValueRow
} from '../../../../../shared/browser-api-test-types'

type BrowserApiTestRequestFormProps = {
  method: string
  url: string
  params: BrowserApiTestKeyValueRow[]
  headers: BrowserApiTestKeyValueRow[]
  body: string
  onMethodChange: (method: string) => void
  onUrlChange: (url: string) => void
  onUrlCommit: () => void
  onParamsChange: (params: BrowserApiTestKeyValueRow[]) => void
  onHeadersChange: (headers: BrowserApiTestKeyValueRow[]) => void
  onBodyChange: (body: string) => void
}

function paramLabels(): BrowserApiTestKeyValueLabels {
  return {
    name: translate('browser.networkTools.apiParamName', 'Parameter'),
    value: translate('browser.networkTools.apiParamValue', 'Parameter value'),
    enabled: translate('browser.networkTools.apiParamEnabled', 'Send this parameter'),
    remove: translate('browser.networkTools.apiRemoveParam', 'Remove parameter'),
    add: translate('browser.networkTools.apiAddParam', 'Add parameter')
  }
}

function headerLabels(): BrowserApiTestKeyValueLabels {
  return {
    name: translate('browser.networkTools.headerName', 'Header'),
    value: translate('browser.networkTools.headerValue', 'Value'),
    enabled: translate('browser.networkTools.headerEnabled', 'Send this header'),
    remove: translate('browser.networkTools.removeHeader', 'Remove header'),
    add: translate('browser.networkTools.addHeader', 'Add header')
  }
}

export function BrowserApiTestRequestForm({
  method,
  url,
  params,
  headers,
  body,
  onMethodChange,
  onUrlChange,
  onUrlCommit,
  onParamsChange,
  onHeadersChange,
  onBodyChange
}: BrowserApiTestRequestFormProps): React.JSX.Element {
  // Why GET: a prefill carries whatever method the logged request used, and the picker has no
  // option to represent one this client cannot send.
  const selectedMethod = normalizeBrowserApiTestMethod(method) ?? 'GET'
  const allowsBody = browserApiTestMethodAllowsBody(selectedMethod)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <select
          aria-label={translate('browser.networkTools.apiMethod', 'Method')}
          className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
          value={selectedMethod}
          onChange={(event) => onMethodChange(event.target.value)}
        >
          {BROWSER_API_TEST_METHODS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <Input
          className="h-7 flex-1 font-mono text-xs"
          aria-label={translate('browser.networkTools.apiUrl', 'Request URL')}
          placeholder={translate(
            'browser.networkTools.apiUrlPlaceholder',
            'https://example.com/api'
          )}
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          // Why on blur and not on change: lifting the query out mid-keystroke would move the
          // caret out from under the `?` the user is still typing.
          onBlur={onUrlCommit}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">
          {translate('browser.networkTools.apiParams', 'Query parameters')}
        </span>
        <BrowserApiTestKeyValueRows
          rows={params}
          labels={paramLabels()}
          onChange={onParamsChange}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">
          {translate('browser.networkTools.apiHeaders', 'Headers')}
        </span>
        <BrowserApiTestKeyValueRows
          rows={headers}
          labels={headerLabels()}
          onChange={onHeadersChange}
        />
      </div>
      {allowsBody ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <span className="text-[10px] text-muted-foreground">
            {translate('browser.networkTools.apiBody', 'Request body')}
          </span>
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
            <JsonFormatterInput value={body} onChange={onBodyChange} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
