export type MyMemoryParseResult =
  | { ok: true; translatedText: string }
  | { ok: false; kind: 'rate-limited' | 'provider-error' }

const PROVIDER_ERROR = { ok: false, kind: 'provider-error' } as const
const RATE_LIMITED = { ok: false, kind: 'rate-limited' } as const

function readStatus(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function parseMyMemoryResponse(raw: unknown): MyMemoryParseResult {
  if (typeof raw !== 'object' || raw === null) {
    return PROVIDER_ERROR
  }
  const body = raw as Record<string, unknown>
  const status = readStatus(body.responseStatus)
  if (status === 429 || body.quotaFinished === true) {
    return RATE_LIMITED
  }
  const responseData = body.responseData
  if (typeof responseData !== 'object' || responseData === null) {
    return PROVIDER_ERROR
  }
  const translatedText = (responseData as Record<string, unknown>).translatedText
  if (typeof translatedText !== 'string' || translatedText === '') {
    return PROVIDER_ERROR
  }
  // The daily cap arrives as prose in the translation slot with an HTTP 200.
  if (translatedText.includes('MYMEMORY WARNING')) {
    return RATE_LIMITED
  }
  if (status !== null && (status < 200 || status > 299)) {
    return PROVIDER_ERROR
  }
  return { ok: true, translatedText }
}
