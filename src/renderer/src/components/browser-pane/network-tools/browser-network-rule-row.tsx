import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import { BrowserNetworkOverrideEditor } from './browser-network-override-editor'
import type {
  BrowserHeaderMutation,
  BrowserNetworkRule
} from '../../../../../shared/browser-network-rule'

export function BrowserNetworkRuleRow({
  rule,
  selected,
  onSelectedChange,
  onPatchRule,
  onPatchHeader,
  onDelete
}: {
  rule: BrowserNetworkRule
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  onPatchRule: (patch: Partial<BrowserNetworkRule>) => void
  onPatchHeader: (patch: Partial<BrowserHeaderMutation>) => void
  onDelete: () => void
}): React.JSX.Element {
  const header = rule.headers[0]
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Checkbox
          aria-label={`${translate('browser.networkTools.arm', 'Arm')} ${rule.label}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(!!checked)}
        />
        <Input
          className="h-7 w-32 text-xs"
          aria-label={translate('browser.networkTools.ruleLabelField', 'Rule label')}
          value={rule.label}
          onChange={(event) => onPatchRule({ label: event.target.value })}
        />
        <Input
          className="h-7 flex-1 text-xs"
          aria-label={translate('browser.networkTools.urlPatternField', 'URL pattern')}
          value={rule.match.urlPattern}
          onChange={(event) =>
            onPatchRule({ match: { ...rule.match, urlPattern: event.target.value } })
          }
        />
        <Input
          className="h-7 w-36 text-xs"
          aria-label={translate('browser.networkTools.headerName', 'Header')}
          placeholder={translate('browser.networkTools.headerName', 'Header')}
          value={header?.name ?? ''}
          onChange={(event) => onPatchHeader({ name: event.target.value })}
        />
        <Input
          className="h-7 w-36 text-xs"
          aria-label={translate('browser.networkTools.headerValue', 'Value')}
          placeholder={translate('browser.networkTools.headerValue', 'Value')}
          value={header?.value ?? ''}
          onChange={(event) => onPatchHeader({ value: event.target.value })}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={`${translate('browser.networkTools.delete', 'Delete')} ${rule.label}`}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <BrowserNetworkOverrideEditor
        override={rule.responseOverride}
        onChange={(responseOverride) => onPatchRule({ responseOverride })}
      />
    </div>
  )
}
