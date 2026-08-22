import { JsonFormatterInput } from '@/components/json-formatter/JsonFormatterInput'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { BrowserApiTestHeaderRows } from './browser-api-test-header-rows'
import {
  browserApiTestMethodAllowsBody,
  normalizeBrowserApiTestMethod
} from '../../../../../shared/browser-api-test-target'
import {
  BROWSER_API_TEST_METHODS,
  type BrowserApiTestHeader
} from '../../../../../shared/browser-api-test-types'

type BrowserApiTestRequestFormProps = {
  method: string
  url: string
  headers: BrowserApiTestHeader[]
  body: string
  onMethodChange: (method: string) => void
  onUrlChange: (url: string) => void
  onHeadersChange: (headers: BrowserApiTestHeader[]) => void
  onBodyChange: (body: string) => void
}

export function BrowserApiTestRequestForm({
  method,
  url,
  headers,
  body,
  onMethodChange,
  onUrlChange,
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
        />
      </div>
      <BrowserApiTestHeaderRows rows={headers} onChange={onHeadersChange} />
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
