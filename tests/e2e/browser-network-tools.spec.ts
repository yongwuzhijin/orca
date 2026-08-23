/**
 * E2E verification of the three browser network tools against a live guest: header rewriting,
 * the API test client, and response overrides. Each assertion lands on something the user can
 * see — the drawer's own DOM, or the guest page the tool acted on.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Locator, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, getActiveWorktreeId, waitForActiveWorktree } from './helpers/store'

const REWRITTEN_HEADER = 'x-orca-e2e'

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

type EchoServer = {
  origin: string
  echoUrl: string
  pageUrl: string
  close: () => Promise<void>
}

/**
 * `/echo` reports back which value of the rewritten header it actually received, so a header rule
 * that never reached the wire is indistinguishable from no rule at all. It also sets a header of
 * its own, which the guest reports as `upstream=` — present only when the real server answered.
 */
async function startEchoServer(): Promise<EchoServer> {
  const server = createServer((request, response) => {
    const requestOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const pathname = new URL(request.url ?? '/', requestOrigin).pathname
    if (pathname === '/echo') {
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'x-api-echo': 'fixture'
      })
      response.end(JSON.stringify({ sent: request.headers[REWRITTEN_HEADER] ?? 'absent' }))
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`
      <!doctype html>
      <html>
        <body style="background:#fff">
          <h1 id="marker">network-tools-fixture</h1>
          <output id="echo">pending</output>
          <script>
            window.callEcho = async () => {
              const reply = await fetch('/echo', { cache: 'no-store' })
              const body = await reply.text()
              document.querySelector('#echo').textContent =
                reply.status + ' upstream=' + reply.headers.get('x-api-echo') + ' ' + body
            }
          </script>
        </body>
      </html>
    `)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    origin,
    echoUrl: `${origin}/echo`,
    pageUrl: `${origin}/`,
    close: () => closeServer(server)
  }
}

async function runInGuest<T>(page: Page, browserTabId: string, script: string): Promise<T> {
  return page.evaluate(
    async ({ targetBrowserTabId, expression }) => {
      const webview = document.querySelector(
        `[data-browser-overlay-tab-id="${targetBrowserTabId}"] webview`
      ) as Electron.WebviewTag | null
      if (!webview) {
        throw new Error(`Missing webview for browser tab ${targetBrowserTabId}`)
      }
      return webview.executeJavaScript(expression) as Promise<T>
    },
    { targetBrowserTabId: browserTabId, expression: script }
  )
}

async function readEchoOutput(page: Page, browserTabId: string): Promise<string | null> {
  return runInGuest<string | null>(
    page,
    browserTabId,
    `document.querySelector('#echo')?.textContent ?? null`
  ).catch(() => null)
}

type FixtureTab = { browserTabId: string; browserPageId: string }

/**
 * Arming reports `no_guest` until main has registered the guest, so the tab is not ready to drive
 * until both the page has painted and the registration has landed.
 */
async function openFixtureTab(page: Page, url: string): Promise<FixtureTab> {
  await waitForActiveWorktree(page)
  // Why: the app follows the host's UI language, and every locator below reads the drawer's own
  // labels — without pinning English these tests only pass on an English machine.
  await page.evaluate(() => window.__store?.getState().updateSettings({ uiLanguage: 'en' }))
  await ensureTerminalVisible(page)
  const worktreeId = await getActiveWorktreeId(page)
  if (!worktreeId) {
    throw new Error('Expected an active worktree')
  }
  const tab = await page.evaluate(
    ({ targetWorktreeId, targetUrl }) => {
      const created = window.__store?.getState().createBrowserTab(targetWorktreeId, targetUrl, {
        title: 'Network tools fixture',
        activate: true
      })
      return created ? { browserTabId: created.id, browserPageId: created.activePageId } : null
    },
    { targetWorktreeId: worktreeId, targetUrl: url }
  )
  if (!tab?.browserPageId) {
    throw new Error('Failed to create the network tools fixture tab')
  }
  const fixtureTab: FixtureTab = {
    browserTabId: tab.browserTabId,
    browserPageId: tab.browserPageId
  }
  await expect
    .poll(() =>
      runInGuest<string | null>(
        page,
        fixtureTab.browserTabId,
        `document.querySelector('#marker')?.textContent ?? null`
      ).catch(() => null)
    )
    .toBe('network-tools-fixture')
  await expect
    .poll(() =>
      page.evaluate(
        async ({ targetBrowserTabId, browserPageId }) => {
          const webview = document.querySelector(
            `[data-browser-overlay-tab-id="${targetBrowserTabId}"] webview`
          ) as Electron.WebviewTag | null
          if (!webview) {
            return false
          }
          try {
            return await window.api.browser.isGuestRegistered({
              browserPageId,
              webContentsId: webview.getWebContentsId()
            })
          } catch {
            return false
          }
        },
        { targetBrowserTabId: fixtureTab.browserTabId, browserPageId: fixtureTab.browserPageId }
      )
    )
    .toBe(true)
  return fixtureTab
}

async function openNetworkTools(page: Page): Promise<Locator> {
  await page.getByTitle('Browser menu').click()
  await page.getByRole('menuitem', { name: 'Network tools' }).click()
  const drawer = page.getByRole('region', { name: 'Network tools' })
  await expect(drawer).toBeVisible()
  return drawer
}

async function addRule(drawer: Locator, urlPattern: string): Promise<void> {
  await drawer.getByRole('button', { name: 'Add rule' }).click()
  await drawer.getByLabel('URL pattern').fill(urlPattern)
}

async function armSingleRule(drawer: Locator): Promise<void> {
  await drawer.getByRole('checkbox', { name: 'Arm New rule' }).click()
  await drawer.getByRole('button', { name: 'Arm', exact: true }).click()
  await expect(drawer.getByText('1 armed')).toBeVisible()
}

test('an armed header rule rewrites a request the guest page makes', async ({ orcaPage }) => {
  const server = await startEchoServer()
  try {
    const tab = await openFixtureTab(orcaPage, server.pageUrl)
    const drawer = await openNetworkTools(orcaPage)

    await addRule(drawer, `${server.origin}/*`)
    await drawer.getByLabel('Header', { exact: true }).fill(REWRITTEN_HEADER)
    await drawer.getByLabel('Value', { exact: true }).fill('armed')
    await armSingleRule(drawer)

    await runInGuest(orcaPage, tab.browserTabId, 'window.callEcho()')
    await expect.poll(() => readEchoOutput(orcaPage, tab.browserTabId)).toContain('"sent":"armed"')
  } finally {
    await server.close()
  }
})

test('the API test client sends a request and renders the response', async ({ orcaPage }) => {
  const server = await startEchoServer()
  try {
    await openFixtureTab(orcaPage, server.pageUrl)
    const drawer = await openNetworkTools(orcaPage)

    await drawer.getByRole('tab', { name: 'Test' }).click()
    await drawer.getByLabel('Request URL').fill(server.echoUrl)
    await drawer.getByRole('button', { name: 'Send' }).click()

    await expect(drawer.getByText('200', { exact: true })).toBeVisible()
    await expect(drawer.getByText('x-api-echo')).toBeVisible()
  } finally {
    await server.close()
  }
})

test('an armed response override answers the guest with the canned response', async ({
  orcaPage
}) => {
  const server = await startEchoServer()
  try {
    const tab = await openFixtureTab(orcaPage, server.pageUrl)
    const drawer = await openNetworkTools(orcaPage)

    await addRule(drawer, `${server.origin}/echo*`)
    await drawer.getByRole('checkbox', { name: 'Override response' }).click()
    await drawer.getByLabel('Status').fill('503')
    await drawer.getByLabel('Response body').fill('{"overridden":true}')
    await armSingleRule(drawer)

    await runInGuest(orcaPage, tab.browserTabId, 'window.callEcho()')
    const echo = expect.poll(() => readEchoOutput(orcaPage, tab.browserTabId))
    await echo.toContain('503')
    await echo.toContain('"overridden":true')
    // Why assert the upstream header is gone: a Response-stage interception replaces only the body,
    // so a body-only match would pass while the status and headers still came from the real server.
    await echo.toContain('upstream=null')
  } finally {
    await server.close()
  }
})
