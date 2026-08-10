const ESCAPE_SEQUENCE_RE = /\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g

const ESCAPE_REPLACEMENTS: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t'
}

const UNESCAPED_QUOTE_RE = /(^|[^\\])(\\\\)*"/
// Why: an odd backslash run at the end of the slice escapes the closing quote,
// so the outer pair is not a real pair (`"abc\"` is what JSON.parse rejects).
const ESCAPED_CLOSING_QUOTE_RE = /(^|[^\\])(\\\\)*\\$/

// Why: pasted payloads are usually a quoted JSON string ("{\"a\":1}"); leaving
// the outer quotes in place would keep the result unparseable.
function stripWrappingQuotes(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return text
  }
  const inner = trimmed.slice(1, -1)
  if (UNESCAPED_QUOTE_RE.test(inner) || ESCAPED_CLOSING_QUOTE_RE.test(inner)) {
    return text
  }
  return inner
}

export function unescapeJsonText(text: string): string {
  return stripWrappingQuotes(text).replace(ESCAPE_SEQUENCE_RE, (match, group: string) => {
    if (group.startsWith('u')) {
      return String.fromCharCode(Number.parseInt(group.slice(1), 16))
    }
    return ESCAPE_REPLACEMENTS[group] ?? match
  })
}
