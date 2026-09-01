export type OpenAiCompatibleTranslationRequest = {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export type OpenAiCompatibleTranslationResult =
  | { ok: true; text: string }
  | {
      ok: false
      kind: 'unauthorized' | 'timeout' | 'offline' | 'aborted' | 'provider-error'
      detail?: string
    }

type ChatCompletionResponse = {
  choices?: { message?: { content?: unknown } }[]
  error?: { message?: unknown }
}

export function joinChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

export function sanitizeOpenAiCompatibleTranslationDetail(message: string): string {
  const sanitized = message
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .trim()
  return sanitized || 'Translation request failed'
}

export async function requestOpenAiCompatibleTranslation(
  input: OpenAiCompatibleTranslationRequest
): Promise<OpenAiCompatibleTranslationResult> {
  if (input.signal?.aborted) {
    return { ok: false, kind: 'aborted' }
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? 60_000
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(
    () => timeoutController.abort(new DOMException('Timeout', 'TimeoutError')),
    timeoutMs
  )

  const onExternalAbort = (): void => timeoutController.abort(input.signal?.reason)
  input.signal?.addEventListener('abort', onExternalAbort, { once: true })

  try {
    const response = await fetchImpl(joinChatCompletionsUrl(input.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content: input.prompt }]
      }),
      signal: timeoutController.signal
    })

    if (response.status === 401) {
      const detail = await readErrorDetail(response)
      return {
        ok: false,
        kind: 'unauthorized',
        detail: sanitizeOpenAiCompatibleTranslationDetail(detail)
      }
    }

    if (!response.ok) {
      const detail = await readErrorDetail(response)
      return {
        ok: false,
        kind: 'provider-error',
        detail: sanitizeOpenAiCompatibleTranslationDetail(detail)
      }
    }

    const data = (await response.json()) as ChatCompletionResponse
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.trim() === '') {
      return {
        ok: false,
        kind: 'provider-error',
        detail: 'Translation response did not include text.'
      }
    }
    return { ok: true, text: content }
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return { ok: false, kind: 'aborted' }
    }
    if (timeoutController.signal.aborted) {
      return { ok: false, kind: 'timeout' }
    }
    if (error instanceof TypeError) {
      return { ok: false, kind: 'offline' }
    }
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      kind: 'provider-error',
      detail: sanitizeOpenAiCompatibleTranslationDetail(detail)
    }
  } finally {
    clearTimeout(timeoutId)
    input.signal?.removeEventListener('abort', onExternalAbort)
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as ChatCompletionResponse
    if (typeof data.error?.message === 'string') {
      return data.error.message
    }
  } catch {
    // Fall through to status text.
  }
  return response.statusText || `HTTP ${response.status}`
}
