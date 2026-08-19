/**
 * All-caps input is translated as a different token than its lowercase form
 * (`DEPENDENT` → `家属`, `dependent` → the dictionary senses), so a shouted word
 * is lowercased before it reaches the provider. Verified harmless for acronyms:
 * `USA` and `usa` return byte-identical gtx payloads.
 */
export function normalizeTranslationQuery(text: string): string {
  const trimmed = text.trim()
  if (/\s/.test(trimmed)) {
    return trimmed
  }
  const letters = trimmed.match(/\p{L}/gu)
  if (letters === null || letters.length < 2) {
    return trimmed
  }
  return /\p{Ll}/u.test(trimmed) ? trimmed : trimmed.toLowerCase()
}
