import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { BrowserNetworkResponseOverride } from '../../../../../shared/browser-network-rule'

// Mirrors the 100-599 window sanitizeResponseOverride enforces; a regex also rejects the trailing
// junk Number.parseInt would happily swallow.
const STATUS_CODE = /^[1-5]\d{2}$/

// Why local text instead of the prop: every keystroke persists, and main drops the whole override
// for an out-of-range status, so a field pinned to the saved value could never reach "503" — its
// own "5" would be discarded and the override silently lost.
function StatusInput({
  statusCode,
  onCommit
}: {
  statusCode: number
  onCommit: (statusCode: number) => void
}): React.JSX.Element {
  const [text, setText] = useState(String(statusCode))
  return (
    <Input
      className="h-7 w-16 text-xs"
      aria-label={translate('browser.networkTools.overrideStatus', 'Status')}
      aria-invalid={!STATUS_CODE.test(text)}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        if (STATUS_CODE.test(event.target.value)) {
          onCommit(Number(event.target.value))
        }
      }}
    />
  )
}

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
          <StatusInput
            statusCode={override.statusCode}
            onCommit={(statusCode) => onChange({ ...override, statusCode })}
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
