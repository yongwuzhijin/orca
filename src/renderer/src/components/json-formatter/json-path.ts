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

// Why: paths are prefix-encoded, so every boundary is an ancestor — but a `.` or `[`
// inside a quoted key is not a boundary.
export function listJsonAncestorPaths(path: string): string[] {
  if (path === JSON_ROOT_PATH) {
    return []
  }
  const ancestors: string[] = []
  const push = (candidate: string): void => {
    if (ancestors.at(-1) !== candidate) {
      ancestors.push(candidate)
    }
  }
  push(JSON_ROOT_PATH)
  let inQuotes = false
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index]
    if (inQuotes) {
      if (char === '\\') {
        index += 1
      } else if (char === '"') {
        inQuotes = false
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === '.' || char === '[') {
      push(path.slice(0, index))
    }
  }
  return ancestors
}
