import { ORCA_BROWSER_BLANK_URL } from '../../../../../shared/constants'
import type { BrowserPage as BrowserPageState } from '../../../../../shared/browser-workspace-types'
import { normalizeExternalBrowserUrl } from '../../../../../shared/browser-url'
import { getLiveBrowserUrl } from '../describe-page/live-browser-url-registry'
import { getShareableBrowserArtifactFile } from '../describe-page/browser-artifact-upload'
import { getBrowserPageZoomIndicatorState } from '../host-guest/browser-page-zoom'
import { getOpenableExternalUrl, toDisplayUrl } from '../describe-page/browser-page-url-display'

export function buildBrowserPagePaneUrlDisplayState({
  browserTab,
  workspaceConnectionId,
  browserZoomFeedbackVisible,
  browserZoomPercent,
  browserDefaultZoomPercent
}: {
  browserTab: BrowserPageState
  workspaceConnectionId: string | null
  browserZoomFeedbackVisible: boolean
  browserZoomPercent: number
  browserDefaultZoomPercent: number
}): {
  isBlankTab: boolean
  liveBrowserUrl: string
  externalUrl: string | null
  currentBrowserUrl: string
  shareableArtifactFile: ReturnType<typeof getShareableBrowserArtifactFile>
  failedNavigationUrl: string
  failureExternalUrl: string | null
  showFailureOverlay: boolean
  browserZoomIndicatorState: ReturnType<typeof getBrowserPageZoomIndicatorState>
} {
  // Why: a blank tab reads as 'about:blank' or the resolved data: URL, so match both to keep the "New Browser Tab" overlay visible.
  const isBlankTab = browserTab.url === 'about:blank' || browserTab.url === ORCA_BROWSER_BLANK_URL
  // Why: synchronous webview URL access blocks render; navigation handlers update this cache before their store writes can re-render the pane.
  const liveBrowserUrl = getLiveBrowserUrl(browserTab.id) ?? browserTab.url
  const externalUrl = getOpenableExternalUrl(liveBrowserUrl)
  const currentBrowserUrl = toDisplayUrl(liveBrowserUrl)
  const shareableArtifactFile =
    workspaceConnectionId === null ? getShareableBrowserArtifactFile(currentBrowserUrl) : null
  const failedNavigationUrl = browserTab.loadError?.validatedUrl ?? currentBrowserUrl
  const failureExternalUrl = normalizeExternalBrowserUrl(failedNavigationUrl)
  const showFailureOverlay = Boolean(browserTab.loadError) && !isBlankTab
  const browserZoomIndicatorState = getBrowserPageZoomIndicatorState({
    feedbackVisible: browserZoomFeedbackVisible,
    isDefaultZoom: browserZoomPercent === browserDefaultZoomPercent
  })
  return {
    isBlankTab,
    liveBrowserUrl,
    externalUrl,
    currentBrowserUrl,
    shareableArtifactFile,
    failedNavigationUrl,
    failureExternalUrl,
    showFailureOverlay,
    browserZoomIndicatorState
  }
}
