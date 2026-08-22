import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { BrowserNetworkResponseOverride } from '../../../../../shared/browser-network-rule'

// Why prefill a content type here rather than default one in main: a synthesized response with no
// content type renders as plain text, and JSON is what an endpoint override is almost always for.
function createOverride(): BrowserNetworkResponseOverride {
  return {
    statusCode: 200,
    headers: [{ target: 'response', op: 'set', name: 'Content-Type', value: 'application/json' }],
    body: '{}'
  }
}

export function BrowserNetworkOverrideEditor({
  override,
  onChange
}: {
  override: BrowserNetworkResponseOverride | undefined
  onChange: (override: BrowserNetworkResponseOverride | undefined) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 pl-6">
      <Checkbox
        aria-label={translate('browser.networkTools.overrideEnable', 'Override response')}
        checked={!!override}
        onCheckedChange={(checked) => onChange(checked ? createOverride() : undefined)}
      />
      {override ? (
        <>
          <Input
            className="h-7 w-16 text-xs"
            aria-label={translate('browser.networkTools.overrideStatus', 'Status')}
            value={String(override.statusCode)}
            onChange={(event) => {
              const statusCode = Number.parseInt(event.target.value, 10)
              if (Number.isNaN(statusCode)) {
                return
              }
              onChange({ ...override, statusCode })
            }}
          />
          <Textarea
            className="min-h-7 flex-1 font-mono text-xs"
            rows={2}
            aria-label={translate('browser.networkTools.overrideBody', 'Response body')}
            value={override.body}
            onChange={(event) => onChange({ ...override, body: event.target.value })}
          />
        </>
      ) : (
        <span className="text-[11px] text-muted-foreground">
          {translate('browser.networkTools.overrideEnable', 'Override response')}
        </span>
      )}
    </div>
  )
}
