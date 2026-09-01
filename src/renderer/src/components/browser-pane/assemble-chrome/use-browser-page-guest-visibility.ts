import { useEffect, type RefObject } from 'react'

export function useBrowserPageGuestVisibility(
  webviewRef: RefObject<Electron.WebviewTag | null>,
  inputLocked: boolean,
  showFailureOverlay: boolean
): void {
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }
    // Why: Electron webviews keep receiving native input under a React overlay unless their own hit testing is disabled.
    webview.style.pointerEvents = inputLocked ? 'none' : 'auto'
  }, [inputLocked, webviewRef])

  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) {
      return
    }
    // Why: some Electron builds keep painting a hidden guest layer, so drop it from layout (display:none) instead of just hiding it.
    webview.style.display = showFailureOverlay ? 'none' : 'flex'
  }, [showFailureOverlay, webviewRef])
}
