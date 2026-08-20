import type { Session } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { googleAuthUserAgent } from './browser-google-auth-ua'
import {
  cleanElectronUserAgent,
  createClientHintsStage,
  setupClientHintsOverride
} from './browser-session-ua'

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.6890.3 Safari/537.36'
const EDGE_UA = `${CHROME_UA} Edg/147.0.3210.5`
// Why: the app token only strips where Electron actually emits it — between "Gecko)" and "Chrome/".
const ELECTRON_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Orca/1.0.0 Chrome/147.0.6890.3 Electron/32.0.0 Safari/537.36'

function details(url: string): Electron.OnBeforeSendHeadersListenerDetails {
  return {
    id: 1,
    url,
    method: 'GET',
    resourceType: 'xhr',
    webContentsId: 7,
    timestamp: 0,
    requestHeaders: {}
  } as unknown as Electron.OnBeforeSendHeadersListenerDetails
}

// Why: the stage mutates the headers object in place, so the caller reads the result back out of it.
function run(
  stage: ReturnType<typeof createClientHintsStage>,
  url: string,
  headers: Record<string, string>
): Record<string, string> {
  stage(details(url), headers)
  return headers
}

describe('cleanElectronUserAgent', () => {
  it('strips the Electron and app tokens but keeps the Chrome token', () => {
    const cleaned = cleanElectronUserAgent(ELECTRON_UA)

    expect(cleaned).not.toContain('Electron/')
    expect(cleaned).not.toContain('Orca/')
    expect(cleaned).toContain('Chrome/147.0.6890.3')
  })
})

describe('createClientHintsStage', () => {
  it('rewrites sec-ch-ua to the clean Chrome brand list on https requests', () => {
    const headers = run(createClientHintsStage(CHROME_UA), 'https://example.com/', {
      'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="147", "Electron";v="32"'
    })

    expect(headers['sec-ch-ua']).toContain('Chromium')
    expect(headers['sec-ch-ua']).not.toContain('Electron')
  })

  it('leaves a plain http request untouched', () => {
    // Why: the stage re-creates the old { urls: ['https://*/*'] } listener filter by hand.
    const headers = run(createClientHintsStage(CHROME_UA), 'http://example.com/', {
      'sec-ch-ua': 'old'
    })

    expect(headers).toEqual({ 'sec-ch-ua': 'old' })
  })

  it('replaces a differently-cased Sec-CH-UA in place instead of adding a second entry', () => {
    const headers = run(createClientHintsStage(CHROME_UA), 'https://example.com/', {
      'Sec-CH-UA': 'old'
    })

    const hintKeys = Object.keys(headers).filter((key) => key.toLowerCase() === 'sec-ch-ua')
    expect(hintKeys).toEqual(['Sec-CH-UA'])
    expect(headers['Sec-CH-UA']).toContain('Chromium')
  })

  it('presents the Google auth Firefox UA on auth hosts', () => {
    const headers = run(
      createClientHintsStage(CHROME_UA),
      'https://accounts.google.com/v3/signin/identifier',
      { 'User-Agent': CHROME_UA }
    )

    expect(headers['User-Agent']).toBe(googleAuthUserAgent())
  })

  it('overrides sec-ch-ua headers for Edge UA', () => {
    // Why: the url is load-bearing now that the stage re-creates the https-only filter.
    const headers = run(createClientHintsStage(EDGE_UA), 'https://example.com/', {
      'sec-ch-ua': 'old',
      'sec-ch-ua-full-version-list': 'old'
    })

    expect(headers['sec-ch-ua']).toContain('Microsoft Edge')
    expect(headers['sec-ch-ua']).toContain('"147"')
    expect(headers['sec-ch-ua-full-version-list']).toContain('147.0.3210.5')
  })

  it('overrides sec-ch-ua headers for Chrome UA', () => {
    const headers = run(createClientHintsStage(CHROME_UA), 'https://example.com/', {
      'sec-ch-ua': 'old'
    })

    expect(headers['sec-ch-ua']).toContain('Google Chrome')
    expect(headers['sec-ch-ua']).not.toContain('Microsoft Edge')
  })

  it('leaves sec-ch-ua untouched off auth hosts for a non-Chrome UA', () => {
    // Why: the Google-auth Firefox switch must install regardless of the base UA.
    const headers = run(
      createClientHintsStage('Mozilla/5.0 (compatible; MSIE 10.0)'),
      'https://example.com/',
      { 'sec-ch-ua': 'old' }
    )

    expect(headers['sec-ch-ua']).toBe('old')
  })

  it('presents a Firefox UA and strips client hints on Google auth hosts', () => {
    const headers = run(
      createClientHintsStage(CHROME_UA),
      'https://accounts.google.com/v3/signin/identifier',
      {
        'User-Agent': 'Chrome/147',
        'sec-ch-ua': 'old',
        'sec-ch-ua-full-version-list': 'old',
        'sec-ch-ua-platform': '"macOS"'
      }
    )

    expect(headers['User-Agent']).toMatch(/Firefox\/\d/)
    expect(headers['User-Agent']).not.toContain('Chrome')
    expect(headers['sec-ch-ua']).toBeUndefined()
    expect(headers['sec-ch-ua-full-version-list']).toBeUndefined()
    expect(headers['sec-ch-ua-platform']).toBeUndefined()
  })

  it('strips client hints on a cross-host request that carries the Firefox auth UA', () => {
    // Subresource/XHR to a non-auth Google host while the auth document is on
    // screen: the WebContents Firefox UA leaks onto the request header.
    const headers = run(createClientHintsStage(CHROME_UA), 'https://play.google.com/log', {
      'User-Agent': googleAuthUserAgent(),
      'sec-ch-ua': 'old',
      'sec-ch-ua-full-version-list': 'old',
      'sec-ch-ua-platform': '"macOS"',
      'sec-ch-ua-mobile': '?0'
    })

    // UA stays Firefox and every client hint is dropped — one consistent identity.
    expect(headers['User-Agent']).toBe(googleAuthUserAgent())
    expect(headers['sec-ch-ua']).toBeUndefined()
    expect(headers['sec-ch-ua-full-version-list']).toBeUndefined()
    expect(headers['sec-ch-ua-platform']).toBeUndefined()
    expect(headers['sec-ch-ua-mobile']).toBeUndefined()
  })

  it('keeps the clean Chrome identity on cross-host requests that carry the Chrome UA', () => {
    // Regression guard: non-Google sites (Cloudflare) must keep Chrome hints.
    const headers = run(createClientHintsStage(CHROME_UA), 'https://example.com/api', {
      'User-Agent': CHROME_UA,
      'sec-ch-ua': 'old'
    })

    expect(headers['sec-ch-ua']).toContain('Google Chrome')
  })

  it('does not strip hints for the Firefox UA when googleAuthOverride is disabled', () => {
    const headers = run(
      createClientHintsStage(CHROME_UA, { googleAuthOverride: false }),
      'https://play.google.com/log',
      { 'User-Agent': googleAuthUserAgent(), 'sec-ch-ua': 'old' }
    )

    // Imported-native profiles never install the Firefox switch, so the strip
    // branch stays inert and hints are aligned to Chrome instead.
    expect(headers['sec-ch-ua']).toContain('Google Chrome')
  })

  it('keeps Chrome client hints on Google app subdomains (not auth hosts)', () => {
    const headers = run(createClientHintsStage(CHROME_UA), 'https://myaccount.google.com/', {
      'sec-ch-ua': 'old'
    })

    expect(headers['sec-ch-ua']).toContain('Google Chrome')
  })

  it('keeps an imported native UA on auth hosts while aligning its Chrome hints', () => {
    const headers = run(
      createClientHintsStage(CHROME_UA, { googleAuthOverride: false }),
      'https://accounts.google.com/v3/signin/identifier',
      { 'User-Agent': CHROME_UA, 'sec-ch-ua': 'old' }
    )

    expect(headers['User-Agent']).toBe(CHROME_UA)
    expect(headers['sec-ch-ua']).toContain('Google Chrome')
  })

  it('leaves non-Client-Hints headers unchanged', () => {
    // Why: the url is load-bearing now that the stage re-creates the https-only filter.
    const headers = run(
      createClientHintsStage('Mozilla/5.0 Chrome/147.0.0.0 Safari/537.36'),
      'https://example.com/',
      { Cookie: 'abc=123', 'sec-ch-ua': 'old', Accept: 'text/html' }
    )

    expect(headers.Cookie).toBe('abc=123')
    expect(headers.Accept).toBe('text/html')
  })
})

describe('setupClientHintsOverride', () => {
  it('registers the client-hints stage on the session request pipeline', () => {
    const onBeforeSendHeaders = vi.fn()
    // Why: the pipeline is keyed by session object, so a fresh fake avoids other tests' state.
    const sess = {
      webRequest: {
        onBeforeRequest: vi.fn(),
        onBeforeSendHeaders,
        onHeadersReceived: vi.fn(),
        onCompleted: vi.fn(),
        onErrorOccurred: vi.fn()
      }
    } as unknown as Session

    setupClientHintsOverride(sess, CHROME_UA)

    const listener = onBeforeSendHeaders.mock.calls[0][0]
    const callback = vi.fn()
    listener(
      { ...details('https://example.com/'), requestHeaders: { 'sec-ch-ua': 'old' } },
      callback
    )

    expect(callback.mock.calls[0][0].requestHeaders['sec-ch-ua']).toContain('Google Chrome')
  })
})
