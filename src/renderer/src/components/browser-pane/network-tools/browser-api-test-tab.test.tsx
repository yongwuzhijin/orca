// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  BrowserApiTestHeader,
  BrowserApiTestRequest,
  BrowserApiTestResponse
} from '../../../../../shared/browser-api-test-types'

vi.mock('./browser-api-test-request-form', () => ({
  BrowserApiTestRequestForm: ({
    method,
    url,
    headers,
    body,
    onMethodChange,
    onUrlChange,
    onHeadersChange,
    onBodyChange
  }: {
    method: string
    url: string
    headers: BrowserApiTestHeader[]
    body: string
    onMethodChange: (next: string) => void
    onUrlChange: (next: string) => void
    onHeadersChange: (next: BrowserApiTestHeader[]) => void
    onBodyChange: (next: string) => void
  }) => (
    <div>
      <span data-testid="form-state">{`${method} ${url} ${headers.length} ${body}`}</span>
      <input aria-label="url-proxy" value={url} onChange={(e) => onUrlChange(e.target.value)} />
      <input aria-label="body-proxy" value={body} onChange={(e) => onBodyChange(e.target.value)} />
      <input
        aria-label="method-proxy"
        value={method}
        onChange={(e) => onMethodChange(e.target.value)}
      />
      <button
        type="button"
        aria-label="headers-proxy"
        onClick={() => onHeadersChange([{ name: 'x-added', value: '9', enabled: true }])}
      />
    </div>
  )
}))

vi.mock('./browser-api-test-response-view', () => ({
  BrowserApiTestResponseView: ({ response }: { response: BrowserApiTestResponse | null }) =>
    response ? <span data-testid="response">{JSON.stringify(response)}</span> : null
}))

import { BrowserApiTestTab } from './browser-api-test-tab'
import { useBrowserNetworkToolsPanel } from './browser-network-tools-panel-state'

const OK: BrowserApiTestResponse = {
  status: 'ok',
  statusCode: 200,
  statusMessage: 'OK',
  headers: { 'content-type': ['application/json'] },
  body: '{}',
  bodyBytes: 2,
  truncated: false,
  textual: true,
  durationMs: 12
}

const ABORTED: BrowserApiTestResponse = {
  status: 'error',
  reason: 'aborted',
  message: 'Request cancelled.',
  durationMs: 5
}

// Why the typed parameters: an argument-less vi.fn infers an empty call tuple, and every
// mock.calls[n][0] read then fails to compile.
const networkSendRequest = vi.fn(
  async (_args: { request: BrowserApiTestRequest }): Promise<BrowserApiTestResponse> => OK
)
const networkCancelRequest = vi.fn(async (_args: { requestId: string }): Promise<boolean> => true)

beforeEach(() => {
  networkSendRequest.mockReset()
  networkCancelRequest.mockReset()
  networkSendRequest.mockResolvedValue(OK)
  networkCancelRequest.mockResolvedValue(true)
  useBrowserNetworkToolsPanel.setState({ apiPrefill: null })
  Object.assign(window, { api: { browser: { networkSendRequest, networkCancelRequest } } })
})

// Why: this suite family does not load jest-dom, so there is no auto-cleanup between cases.
afterEach(cleanup)

function sendButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Send' })
}

function sentAt(index: number): BrowserApiTestRequest {
  return networkSendRequest.mock.calls[index][0].request
}

describe('BrowserApiTestTab', () => {
  it('names the session profile a request will use', () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId="work" />)
    expect(screen.getByText('Session: work')).toBeTruthy()
  })

  it('falls back to a default session label when the page has no profile', () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    expect(screen.getByText('Session: default')).toBeTruthy()
  })

  it('keeps send disabled until a url is entered', () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    expect(sendButton().getAttribute('disabled')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: '   ' } })
    expect(sendButton().getAttribute('disabled')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/x' } })
    expect(sendButton().getAttribute('disabled')).toBeNull()
  })

  it('sends the form values for its own page and renders the reply', async () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/x' } })
    fireEvent.click(sendButton())

    expect(await screen.findByTestId('response')).toBeTruthy()
    expect(screen.getByTestId('response').textContent).toBe(JSON.stringify(OK))
    expect(networkSendRequest).toHaveBeenCalledTimes(1)
    const sent = sentAt(0)
    expect(sent.browserPageId).toBe('page-a')
    expect(sent.method).toBe('GET')
    expect(sent.url).toBe('https://a.test/x')
    expect(sent.requestId.length).toBeGreaterThan(0)
  })

  // Why: every form field is wired separately, so a dropped handler is invisible until the
  // payload is inspected field by field.
  it('carries every edited field into the payload', async () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/x' } })
    fireEvent.change(screen.getByLabelText('method-proxy'), { target: { value: 'POST' } })
    fireEvent.change(screen.getByLabelText('body-proxy'), { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByLabelText('headers-proxy'))
    fireEvent.click(sendButton())

    await screen.findByTestId('response')

    expect(sentAt(0)).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      headers: [{ name: 'x-added', value: '9', enabled: true }]
    })
  })

  it('shows cancel only while a request is in flight and forwards its request id', async () => {
    let settle: (value: BrowserApiTestResponse) => void = () => {}
    networkSendRequest.mockReturnValue(
      new Promise<BrowserApiTestResponse>((resolve) => {
        settle = resolve
      })
    )
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/x' } })
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()

    fireEvent.click(sendButton())
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    // Why: a second click would start a competing request against the same page.
    expect(sendButton().getAttribute('disabled')).not.toBeNull()
    fireEvent.click(cancel)

    expect(networkCancelRequest).toHaveBeenCalledWith({ requestId: sentAt(0).requestId })
    // Why: cancel means "done waiting", so retrying must not require the abort to round-trip.
    expect(sendButton().getAttribute('disabled')).toBeNull()

    settle(ABORTED)
    expect(await screen.findByTestId('response')).toBeTruthy()
    expect(screen.getByTestId('response').textContent).toBe(JSON.stringify(ABORTED))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    })
  })

  // Why: a stale 200 sitting next to an in-flight request reads as that request's answer.
  it('clears the previous response when a new request starts', async () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/x' } })
    fireEvent.click(sendButton())
    await screen.findByTestId('response')

    networkSendRequest.mockReturnValue(new Promise<BrowserApiTestResponse>(() => {}))
    fireEvent.click(sendButton())

    await waitFor(() => {
      expect(screen.queryByTestId('response')).toBeNull()
    })
  })

  it('ignores a superseded reply so the newer request wins the screen', async () => {
    let settleFirst: (value: BrowserApiTestResponse) => void = () => {}
    networkSendRequest.mockReturnValueOnce(
      new Promise<BrowserApiTestResponse>((resolve) => {
        settleFirst = resolve
      })
    )
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/x' } })
    fireEvent.click(sendButton())
    await screen.findByRole('button', { name: 'Cancel' })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    networkSendRequest.mockResolvedValueOnce(OK)
    // Why: the second send supersedes the first, so the first reply must be dropped.
    fireEvent.change(screen.getByLabelText('url-proxy'), { target: { value: 'https://a.test/y' } })
    fireEvent.click(sendButton())
    expect(await screen.findByTestId('response')).toBeTruthy()

    // Why act: waitFor would pass on its first tick, before the abandoned reply's continuation
    // ran — so the assertion has to be made after the drop has had its chance to happen.
    await act(async () => {
      settleFirst(ABORTED)
      await Promise.resolve()
    })

    expect(screen.getByTestId('response').textContent).toBe(JSON.stringify(OK))
    // Why: main keys its in-flight table on this id and answers `busy` for a repeat, which a
    // retry after cancel would hit while the first request is still unwinding.
    expect(sentAt(1).requestId).not.toBe(sentAt(0).requestId)
  })

  // Why the frozen clock: two sends inside one millisecond share a timestamp, so this is the only
  // way to prove the id does not lean on it alone.
  it('generates a distinct request id even within the same millisecond', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
      fireEvent.change(screen.getByLabelText('url-proxy'), {
        target: { value: 'https://a.test/x' }
      })
      fireEvent.click(sendButton())
      await screen.findByTestId('response')
      fireEvent.click(sendButton())
      await waitFor(() => {
        expect(networkSendRequest).toHaveBeenCalledTimes(2)
      })

      expect(sentAt(1).requestId).not.toBe(sentAt(0).requestId)
    } finally {
      clock.mockRestore()
    }
  })

  it('seeds the form from a prefill and clears it so later edits survive', async () => {
    useBrowserNetworkToolsPanel.setState({
      apiPrefill: {
        method: 'POST',
        url: 'https://a.test/from-log',
        headers: [
          { name: 'accept', value: '*/*', enabled: true },
          { name: 'x-trace', value: '1', enabled: true }
        ]
      }
    })
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)

    await waitFor(() => {
      expect(screen.getByTestId('form-state').textContent).toBe('POST https://a.test/from-log 2 ')
    })
    expect(useBrowserNetworkToolsPanel.getState().apiPrefill).toBeNull()

    fireEvent.change(screen.getByLabelText('body-proxy'), { target: { value: '{"a":1}' } })
    expect(screen.getByTestId('form-state').textContent).toBe(
      'POST https://a.test/from-log 2 {"a":1}'
    )
  })

  // Why: a prefill describes a whole request, so a body left over from the last one would be
  // attached to a URL it was never written for.
  it('drops a leftover body when a prefill arrives', async () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    fireEvent.change(screen.getByLabelText('body-proxy'), { target: { value: 'stale' } })

    useBrowserNetworkToolsPanel.setState({
      apiPrefill: { method: 'GET', url: 'https://a.test/fresh', headers: [] }
    })

    await waitFor(() => {
      expect(screen.getByTestId('form-state').textContent).toBe('GET https://a.test/fresh 1 ')
    })
  })

  it('keeps a default header row when a prefill carries no headers', async () => {
    useBrowserNetworkToolsPanel.setState({
      apiPrefill: { method: 'GET', url: 'https://a.test/bare', headers: [] }
    })
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)

    await waitFor(() => {
      expect(screen.getByTestId('form-state').textContent).toBe('GET https://a.test/bare 1 ')
    })
  })

  it('offers a resize separator between the request and the response', () => {
    render(<BrowserApiTestTab browserPageId="page-a" sessionProfileId={null} />)
    expect(screen.getByRole('separator')).toBeTruthy()
  })
})
