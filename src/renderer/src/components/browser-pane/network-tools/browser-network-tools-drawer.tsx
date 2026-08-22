import { lazy, Suspense, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import { BrowserNetworkRulesTab } from './browser-network-rules-tab'
import { BrowserNetworkLogTab } from './browser-network-log-tab'
import {
  useBrowserNetworkToolsPanel,
  type BrowserNetworkToolsTab
} from './browser-network-tools-panel-state'

// Why: JsonFormatterInput pulls @/lib/monaco-setup, which eagerly imports monaco-editor and its
// workers — a static import would land all of that in every browser tab's bundle.
const BrowserApiTestTab = lazy(async () => ({
  default: (await import('./browser-api-test-tab')).BrowserApiTestTab
}))

type BrowserNetworkToolsDrawerProps = {
  browserPageId: string
  /** Non-null when the guest runs on a remote host, where webRequest is out of reach. */
  browserRuntimeEnvironmentId: string | null
  /** Named in the API tab so the user knows whose cookies a test request will carry. */
  sessionProfileId: string | null
}

export function BrowserNetworkToolsDrawer({
  browserPageId,
  browserRuntimeEnvironmentId,
  sessionProfileId
}: BrowserNetworkToolsDrawerProps): React.JSX.Element | null {
  const openPageId = useBrowserNetworkToolsPanel((s) => s.openPageId)
  const tab = useBrowserNetworkToolsPanel((s) => s.tab)
  const heightPx = useBrowserNetworkToolsPanel((s) => s.heightPx)
  const setTab = useBrowserNetworkToolsPanel((s) => s.setTab)
  const setHeightPx = useBrowserNetworkToolsPanel((s) => s.setHeightPx)
  const close = useBrowserNetworkToolsPanel((s) => s.close)
  const [drag, setDrag] = useState<{ startY: number; startHeight: number } | null>(null)

  // Why: listeners live on the effect so an unmount mid-drag, or a pointercancel from the OS
  // stealing the pointer, cannot leave a stuck drag or a leaked window listener behind.
  useEffect(() => {
    if (!drag) {
      return
    }
    const onMove = (event: PointerEvent): void => {
      setHeightPx(drag.startHeight + (drag.startY - event.clientY))
    }
    const stop = (): void => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [drag, setHeightPx])

  if (openPageId !== browserPageId) {
    return null
  }

  const closeButton = (
    <Button
      size="icon"
      variant="ghost"
      className="h-7 w-7"
      aria-label={translate('browser.networkTools.close', 'Close network tools')}
      onClick={close}
    >
      <X className="h-3.5 w-3.5" />
    </Button>
  )

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col border-t border-border bg-popover shadow-lg"
      style={{ height: `${heightPx}px` }}
      role="region"
      aria-label={translate('browser.networkTools.title', 'Network tools')}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={translate('browser.networkTools.resizeHandle', 'Resize network tools')}
        className="h-1.5 w-full shrink-0 cursor-ns-resize hover:bg-border"
        onPointerDown={(event) => setDrag({ startY: event.clientY, startHeight: heightPx })}
      />
      {browserRuntimeEnvironmentId ? (
        <>
          <div className="flex h-9 shrink-0 items-center justify-end border-b border-border px-2">
            {closeButton}
          </div>
          <p className="p-2 text-xs text-muted-foreground">
            {translate(
              'browser.networkTools.remoteUnavailable',
              'Network tools are unavailable for tabs running on a remote host.'
            )}
          </p>
        </>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(next as BrowserNetworkToolsTab)}
          className="min-h-0 flex-1 gap-0"
        >
          <div className="flex h-9 shrink-0 items-center border-b border-border px-2">
            <TabsList className="h-7 group-data-[orientation=horizontal]/tabs:h-7">
              <TabsTrigger value="rules" className="text-xs">
                {translate('browser.networkTools.tabRules', 'Rules')}
              </TabsTrigger>
              <TabsTrigger value="log" className="text-xs">
                {translate('browser.networkTools.tabLog', 'Log')}
              </TabsTrigger>
              <TabsTrigger value="api" className="text-xs">
                {translate('browser.networkTools.tabApi', 'Test')}
              </TabsTrigger>
            </TabsList>
            <div className="flex-1" />
            {closeButton}
          </div>
          <TabsContent value="rules" className="scrollbar-sleek min-h-0 overflow-auto p-2 text-xs">
            <BrowserNetworkRulesTab browserPageId={browserPageId} />
          </TabsContent>
          <TabsContent value="log" className="scrollbar-sleek min-h-0 overflow-auto p-2 text-xs">
            <BrowserNetworkLogTab browserPageId={browserPageId} />
          </TabsContent>
          {/* Why no overflow-auto: the tab lays itself out with flex-1 and Monaco needs a bounded
              height, so scrolling belongs to the panes inside it. */}
          <TabsContent value="api" className="flex min-h-0 p-2 text-xs">
            <Suspense
              fallback={
                <span className="text-muted-foreground">
                  {translate('browser.networkTools.apiLoading', 'Loading…')}
                </span>
              }
            >
              <BrowserApiTestTab
                browserPageId={browserPageId}
                sessionProfileId={sessionProfileId}
              />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
