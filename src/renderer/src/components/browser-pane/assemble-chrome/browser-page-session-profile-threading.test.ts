import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Why source reading: both hops typecheck happily with a hardcoded null, so tsc cannot catch a
// dropped profile — and rendering either component needs a webview, portal and a dozen hook
// controllers. The API test tab would just silently label every request "Session: default".
function jsxCall(fileName: string, tagName: string): string {
  const source = readFileSync(fileURLToPath(new URL(`./${fileName}`, import.meta.url)), 'utf8')
  const start = source.indexOf(`<${tagName}`)
  expect(start).toBeGreaterThan(-1)
  const end = source.indexOf('/>', start)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('browser page session profile threading', () => {
  it('hands the pane profile to the viewport overlays', () => {
    expect(jsxCall('browser-page-pane.tsx', 'BrowserPageViewportOverlays')).toContain(
      'sessionProfileId={sessionProfileId}'
    )
  })

  it('hands the overlay profile to the network tools drawer', () => {
    expect(jsxCall('browser-page-viewport-overlays.tsx', 'BrowserNetworkToolsDrawer')).toContain(
      'sessionProfileId={sessionProfileId}'
    )
  })

  // Why: BrowserPage has no sessionProfileId — the profile binds per workspace. Reading it off the
  // page object silently yields undefined, so the prop must come from above.
  it('does not read the profile off the page object', () => {
    expect(
      jsxCall('browser-page-viewport-overlays.tsx', 'BrowserNetworkToolsDrawer')
    ).not.toContain('browserTab.sessionProfileId')
  })
})
