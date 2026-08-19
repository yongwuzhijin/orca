export type GoogleGtxTranslation = {
  translatedText: string
  detectedSourceLanguage: string | null
}

// gtx answers with untyped nested arrays: [segments, null, detectedSource, ...].
export function parseGoogleGtxResponse(raw: unknown): GoogleGtxTranslation | null {
  if (!Array.isArray(raw)) {
    return null
  }
  const segments = raw[0]
  if (!Array.isArray(segments)) {
    return null
  }
  let translatedText = ''
  for (const segment of segments) {
    // Long input is split across segments; skipping the join truncates to sentence one.
    if (Array.isArray(segment) && typeof segment[0] === 'string') {
      translatedText += segment[0]
    }
  }
  if (translatedText.length === 0) {
    return null
  }
  const detected = raw[2]
  return {
    translatedText,
    detectedSourceLanguage: typeof detected === 'string' ? detected : null
  }
}
