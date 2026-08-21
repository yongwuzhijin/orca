import { useEffect } from 'react'
import { getShortcutPlatform } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { keybindingMatchesAction } from '../../../../../shared/keybindings'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

export function useBrowserNetworkToolsShortcut({
  browserPageId,
  isActive
}: {
  browserPageId: string
  isActive: boolean
}): void {
  const keybindings = useAppStore((state) => state.keybindings)
  const toggle = useBrowserNetworkToolsPanel((state) => state.toggle)
  const close = useBrowserNetworkToolsPanel((state) => state.close)

  useEffect(() => {
    if (!isActive) {
      return
    }
    const shortcutPlatform = getShortcutPlatform()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!keybindingMatchesAction('browser.networkTools', event, shortcutPlatform, keybindings)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      toggle(browserPageId)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [browserPageId, isActive, keybindings, toggle])

  // Why: the drawer is one module-level panel, so a deactivated tab must release it or the next
  // tab shows a drawer scoped to a page it is not looking at.
  useEffect(() => {
    if (!isActive) {
      close()
    }
  }, [close, isActive])
}
