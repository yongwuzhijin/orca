import type { SessionEvent } from '../../../../../shared/acp/session-event'

type ToolCallEvent = Extract<SessionEvent, { kind: 'tool_call' }>

export type AcpDiffLine = { kind: 'add' | 'del' | 'context' | 'meta'; text: string }

export type AcpToolPresentation =
  | {
      kind: 'file'
      title: string
      path: string | null
      added: number
      removed: number
      lines: AcpDiffLine[]
    }
  | { kind: 'command'; title: string; command: string | null; output: string | null }
  | {
      kind: 'subagent'
      title: string
      model: string | null
      stage: string | null
      result: string | null
    }
  | { kind: 'generic'; title: string; detail: string | null }

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: UnknownRecord | null, keys: string[]): string | null {
  if (!record) {
    return null
  }
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return null
}

function extractText(value: unknown, depth = 0): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null
  }
  if (depth >= 3) {
    return null
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractText(item, depth + 1))
      .filter((item): item is string => item !== null)
    return parts.length > 0 ? parts.join('\n') : null
  }
  if (!isRecord(value)) {
    return null
  }
  for (const key of ['output', 'stdout', 'result', 'text', 'content']) {
    const text = extractText(value[key], depth + 1)
    if (text !== null) {
      return text
    }
  }
  return null
}

function isSubagent(event: ToolCallEvent, input: UnknownRecord | null): boolean {
  return (
    /task|subagent|agent/i.test(event.toolKind ?? '') ||
    /task|subagent/i.test(event.title) ||
    (input !== null && Object.hasOwn(input, 'subagent_type'))
  )
}

function isFileTool(event: ToolCallEvent, input: UnknownRecord | null): boolean {
  const hasTextEdit =
    readString(input, ['old_string', 'oldString', 'old']) !== null ||
    readString(input, ['new_string', 'newString', 'new']) !== null
  return (
    /edit|write|patch/i.test(event.toolKind ?? '') ||
    /Edit|Write|MultiEdit|apply_patch|str_replace/i.test(event.title) ||
    hasTextEdit
  )
}

function isCommandTool(event: ToolCallEvent, input: UnknownRecord | null): boolean {
  return (
    /execute|terminal|shell|command/i.test(event.toolKind ?? '') ||
    /Bash|Shell|Terminal|Command/i.test(event.title) ||
    readString(input, ['command', 'cmd']) !== null
  )
}

function classifyDiffLine(text: string): AcpDiffLine {
  if (
    text.startsWith('--- ') ||
    text.startsWith('+++ ') ||
    text.startsWith('@@') ||
    text.startsWith('diff ') ||
    text.startsWith('index ') ||
    text.startsWith('\\')
  ) {
    return { kind: 'meta', text }
  }
  if (text.startsWith('+')) {
    return { kind: 'add', text }
  }
  if (text.startsWith('-')) {
    return { kind: 'del', text }
  }
  return { kind: 'context', text }
}

function parseUnifiedDiff(diff: string): {
  added: number
  removed: number
  lines: AcpDiffLine[]
} {
  const lines = splitDisplayLines(diff).map(classifyDiffLine)
  return {
    added: lines.filter((line) => line.kind === 'add').length,
    removed: lines.filter((line) => line.kind === 'del').length,
    lines
  }
}

function splitDisplayLines(text: string | null): string[] {
  if (text === null || text.length === 0) {
    return []
  }
  const lines = text.split('\n')
  if (lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

function readUnifiedDiff(event: ToolCallEvent, input: UnknownRecord | null): string | null {
  const nestedDiff = readString(input, ['diff', 'patch'])
  if (nestedDiff !== null) {
    return nestedDiff
  }
  if (
    typeof event.rawInput === 'string' &&
    (/(^|\n)@@ /.test(event.rawInput) ||
      (/(^|\n)--- /.test(event.rawInput) && /(^|\n)\+\+\+ /.test(event.rawInput)))
  ) {
    return event.rawInput
  }
  return null
}

function presentFile(
  event: ToolCallEvent,
  input: UnknownRecord | null
): Extract<AcpToolPresentation, { kind: 'file' }> | null {
  const path = readString(input, ['path', 'file_path', 'filePath'])
  const diff = readUnifiedDiff(event, input)
  if (diff !== null) {
    return { kind: 'file', title: event.title, path, ...parseUnifiedDiff(diff) }
  }

  const oldText = readString(input, ['old_string', 'oldString', 'old'])
  const newText = readString(input, ['new_string', 'newString', 'new', 'content', 'file_text'])
  if (path === null && oldText === null && newText === null) {
    return null
  }
  const oldLines = splitDisplayLines(oldText)
  const newLines = splitDisplayLines(newText)
  return {
    kind: 'file',
    title: event.title,
    path,
    added: newLines.length,
    removed: oldLines.length,
    lines: [
      ...oldLines.map((text): AcpDiffLine => ({ kind: 'del', text: `-${text}` })),
      ...newLines.map((text): AcpDiffLine => ({ kind: 'add', text: `+${text}` }))
    ]
  }
}

function stringifyUnknown(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  try {
    const json = JSON.stringify(value, null, 2)
    if (json !== undefined) {
      return json
    }
  } catch {
    // Engine payloads are untrusted; a lossy fallback is preferable to breaking the timeline.
  }
  try {
    return String(value)
  } catch {
    return null
  }
}

function stringifyMeaningfulContent(value: unknown): string | null {
  const text = extractText(value)
  if (text !== null) {
    return text
  }
  if (
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  ) {
    return null
  }
  return stringifyUnknown(value)
}

export function presentAcpToolCall(event: ToolCallEvent): AcpToolPresentation {
  const input = isRecord(event.rawInput) ? event.rawInput : null

  // Agent payloads may also look like shell/file tools, so preserve their richer identity first.
  if (isSubagent(event, input)) {
    return {
      kind: 'subagent',
      title: readString(input, ['description', 'title', 'name']) ?? event.title,
      model: readString(input, ['model']),
      stage: readString(input, ['stage', 'statusText', 'prompt']),
      result: extractText(event.content) ?? extractText(input)
    }
  }
  if (isFileTool(event, input)) {
    const presentation = presentFile(event, input)
    if (presentation !== null) {
      return presentation
    }
  }
  if (isCommandTool(event, input)) {
    const command = readString(input, ['command', 'cmd'])
    const output = extractText(event.content)
    if (command !== null || output !== null) {
      return { kind: 'command', title: event.title, command, output }
    }
  }
  return {
    kind: 'generic',
    title: event.title,
    detail:
      stringifyMeaningfulContent(event.content) ??
      stringifyUnknown(event.rawInput) ??
      stringifyUnknown(event.content)
  }
}
