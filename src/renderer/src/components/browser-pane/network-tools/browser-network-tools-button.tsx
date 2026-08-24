import { useEffect, useState } from 'react'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

export function BrowserNetworkToolsButton({
  browserPageId
}: {
  browserPageId: string
}): React.JSX.Element {
  const drawerOpenPageId = useBrowserNetworkToolsPanel((s) => s.openPageId)
  const [armedRuleCount, setArmedRuleCount] = useState(0)

  // Why: an armed rule silently rewrites requests, so the toolbar must show it even when the
  // drawer that armed it is closed — hence re-reading whenever the drawer opens or closes.
  useEffect(() => {
    let cancelled = false
    void window.api.browser
      .networkReadArmedRules({ browserPageId })
      .then((result) => {
        if (!cancelled) {
          setArmedRuleCount(result.armedRuleIds.length)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArmedRuleCount(0)
        }
      })
    return () => {
      cancelled = true
    }
  }, [browserPageId, drawerOpenPageId])

  const armed = armedRuleCount > 0
  // Why: the highlight is the only armed signal left, so the accessible name has to carry it too.
  const label = armed
    ? translate(
        'browser.networkTools.armedIndicator',
        'Network rules are rewriting requests on this tab'
      )
    : translate('browser.networkTools.title', 'Network tools')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn('h-7 w-7', armed && 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/25')}
          aria-label={label}
          data-armed={armed ? 'true' : undefined}
          onClick={() => useBrowserNetworkToolsPanel.getState().toggle(browserPageId)}
        >
          <Globe className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
