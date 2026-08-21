import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

export function BrowserNetworkArmedIndicator({
  browserPageId
}: {
  browserPageId: string
}): React.JSX.Element | null {
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

  if (armedRuleCount === 0) {
    return null
  }
  return (
    <span
      className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600"
      title={translate(
        'browser.networkTools.armedIndicator',
        'Network rules are rewriting requests on this tab'
      )}
    >
      {translate('browser.networkTools.armedBadge', 'NET')}
    </span>
  )
}
