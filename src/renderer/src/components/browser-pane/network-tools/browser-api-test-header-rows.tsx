import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type { BrowserApiTestHeader } from '../../../../../shared/browser-api-test-types'

export function BrowserApiTestHeaderRows({
  rows,
  onChange
}: {
  rows: BrowserApiTestHeader[]
  onChange: (rows: BrowserApiTestHeader[]) => void
}): React.JSX.Element {
  const patch = (index: number, next: Partial<BrowserApiTestHeader>): void => {
    onChange(rows.map((row, at) => (at === index ? { ...row, ...next } : row)))
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, index) => (
        // Why index: these rows have no stable identity and reordering is not a feature.
        <div key={index} className="flex items-center gap-1.5">
          <Checkbox
            aria-label={translate('browser.networkTools.headerEnabled', 'Send this header')}
            checked={row.enabled}
            onCheckedChange={(checked) => patch(index, { enabled: checked === true })}
          />
          <Input
            className="h-7 w-36 text-xs"
            aria-label={translate('browser.networkTools.headerName', 'Header')}
            placeholder={translate('browser.networkTools.headerName', 'Header')}
            value={row.name}
            onChange={(event) => patch(index, { name: event.target.value })}
          />
          <Input
            className="h-7 flex-1 text-xs"
            aria-label={translate('browser.networkTools.headerValue', 'Value')}
            placeholder={translate('browser.networkTools.headerValue', 'Value')}
            value={row.value}
            onChange={(event) => patch(index, { value: event.target.value })}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={translate('browser.networkTools.removeHeader', 'Remove header')}
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="h-7 w-fit text-xs"
        onClick={() => onChange([...rows, { name: '', value: '', enabled: true }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {translate('browser.networkTools.addHeader', 'Add header')}
      </Button>
    </div>
  )
}
