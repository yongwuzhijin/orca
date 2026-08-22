import { useEffect } from 'react'
import { getShortcutPlatform } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { keybindingMatchesAction } from '../../../../../shared/keybindings'
import { browserOverlayOwnsShortcutTarget } from '../describe-page/browser-overlay-shortcut-target'
import type { BrowserFindShortcutScope } from '../describe-page/browser-page-types'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

export function useBrowserNetworkToolsShortcut({
  browserPageId,
  isActive,
  shortcutScope
}: {
  browserPageId: string
  isActive: boolean
  shortcutScope: BrowserFindShortcutScope
}): void {
  const keybindings = useAppStore((state) => state.keybindings)
  const toggle = useBrowserNetworkToolsPanel((state) => state.toggle)
  const close = useBrowserNetworkToolsPanel((state) => state.close)

  useEffect(() => {
    if (shortcutScope === 'inactive') {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!keybindingMatchesAction('browser.networkTools', event, shortcutPlatform, keybindings)) {
        return
      }
      if (
        shortcutScope === 'owned-target' &&
        !browserOverlayOwnsShortcutTarget(event.target, browserPageId)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      toggle(browserPageId)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [browserPageId, keybindings, shortcutScope, toggle])

  // Why: the drawer is one module-level panel and several panes are active at once in a split, so
  // a deactivating pane must release it only when the open drawer is its own.
  useEffect(() => {
    if (!isActive && useBrowserNetworkToolsPanel.getState().openPageId === browserPageId) {
      close()
    }
  }, [browserPageId, close, isActive])
}
