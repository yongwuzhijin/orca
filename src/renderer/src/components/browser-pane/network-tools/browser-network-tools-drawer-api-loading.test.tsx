// @vitest-environment happy-dom

// Why its own file: the api tab mock has to stay unresolved long enough to observe the Suspense
// fallback, and a module registry is shared across a file — the sibling suite needs it resolved.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserNetworkToolsDrawer } from './browser-network-tools-drawer'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

let releaseApiTab: () => void = () => {}
const apiTabGate = new Promise<void>((resolve) => {
  releaseApiTab = resolve
})

vi.mock('./browser-api-test-tab', async () => {
  await apiTabGate
  return { BrowserApiTestTab: () => <div data-testid="api-tab" /> }
})

beforeEach(() => {
  useBrowserNetworkToolsPanel.getState().close()
  Object.assign(window, { api: { browser: {} } })
})

afterEach(cleanup)

describe('BrowserNetworkToolsDrawer api tab loading', () => {
  it('names the wait while the api tab chunk is still loading', async () => {
    useBrowserNetworkToolsPanel
      .getState()
      .openApiTest('page-a', { method: 'GET', url: 'https://a.test/x', headers: [] })
    render(
      <BrowserNetworkToolsDrawer
        browserPageId="page-a"
        browserRuntimeEnvironmentId={null}
        sessionProfileId={null}
      />
    )

    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByTestId('api-tab')).toBeNull()

    releaseApiTab()

    expect(await screen.findByTestId('api-tab')).toBeTruthy()
    expect(screen.queryByText('Loading…')).toBeNull()
  })
})
