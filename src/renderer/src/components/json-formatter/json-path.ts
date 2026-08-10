export const JSON_ROOT_PATH = ''

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

const KEY_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f'
}

// Why: a single pass keeps the backslash rewrite from re-escaping its own output.
function quoteKey(key: string): string {
  return `["${key.replace(/[\\"\n\r\t\b\f]/g, (char) => KEY_ESCAPES[char])}"]`
}

export function appendJsonObjectKey(parentPath: string, key: string): string {
  if (!IDENTIFIER_RE.test(key)) {
    return `${parentPath}${quoteKey(key)}`
  }
  return parentPath === JSON_ROOT_PATH ? key : `${parentPath}.${key}`
}

export function appendJsonArrayIndex(parentPath: string, index: number): string {
  return `${parentPath}[${index}]`
}

export function toCopyablePath(path: string): string {
  return path === JSON_ROOT_PATH ? '$' : path
}
