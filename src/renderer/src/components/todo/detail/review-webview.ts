import { ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../../shared/browser-guest-web-preferences'

export const REVIEW_MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// Mirrors browser-page-webview.ts: partition + shared webpreferences attribute.
// Each task gets an isolated `review:{taskId}` partition.
export function ensureReviewWebview({
  container,
  taskId,
  url,
  mobile
}: {
  container: HTMLDivElement
  taskId: string
  url: string
  mobile: boolean
}): Electron.WebviewTag {
  let webview = container.querySelector('webview') as Electron.WebviewTag | null
  if (!webview) {
    webview = document.createElement('webview') as Electron.WebviewTag
    webview.setAttribute('partition', `review:${taskId}`)
    webview.setAttribute('allowpopups', '')
    webview.setAttribute('webpreferences', ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
    webview.style.flex = '1'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    webview.style.background = '#ffffff'
    container.appendChild(webview)
  }
  if (mobile) {
    webview.setAttribute('useragent', REVIEW_MOBILE_USER_AGENT)
  } else {
    webview.removeAttribute('useragent')
  }
  if (webview.getAttribute('src') !== url) {
    webview.setAttribute('src', url)
  }
  return webview
}
