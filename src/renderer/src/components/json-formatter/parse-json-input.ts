import { type ParseError, parse, printParseErrorCode } from 'jsonc-parser'
import { unescapeJsonText } from './json-unescape'

// Why: UTF-16 code units, not bytes — jsonc-parser's scanner is charCodeAt-driven, so
// code units track the renderer hang this guard exists to prevent better than bytes do.
export const MAX_JSON_INPUT_CHARS = 5 * 1024 * 1024

export type JsonParseErrorCode =
  | 'too-large'
  | 'too-deep'
  | 'unexpected-end'
  | 'invalid-symbol'
  | 'invalid-number'
  | 'invalid-escape'
  | 'comments-not-allowed'
  | 'trailing-content'
  | 'syntax'

export type JsonParseResult =
  | { status: 'empty' }
  | { status: 'ok'; value: unknown }
  | { status: 'error'; code: JsonParseErrorCode; line: number; column: number }

// Why: ParseErrorCode is an ambient const enum, unusable as a value under isolatedModules.
function mapErrorCode(error: ParseError['error']): JsonParseErrorCode {
  switch (printParseErrorCode(error)) {
    case 'CloseBraceExpected':
    case 'CloseBracketExpected':
    case 'UnexpectedEndOfString':
    case 'UnexpectedEndOfComment':
      return 'unexpected-end'
    case 'InvalidSymbol':
      return 'invalid-symbol'
    // Why: `1e` / `1.` are complete input with a malformed number, not truncated input.
    case 'UnexpectedEndOfNumber':
    case 'InvalidNumberFormat':
      return 'invalid-number'
    case 'InvalidEscapeCharacter':
    case 'InvalidUnicode':
      return 'invalid-escape'
    case 'InvalidCommentToken':
      return 'comments-not-allowed'
    case 'EndOfFileExpected':
      return 'trailing-content'
    default:
      return 'syntax'
  }
}

function toLineColumn(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  const before = text.slice(0, clamped)
  const lastBreak = before.lastIndexOf('\n')
  return { line: before.split('\n').length, column: clamped - lastBreak }
}

export function parseJsonInput(input: string, options: { keepEscapes: boolean }): JsonParseResult {
  if (input.trim().length === 0) {
    return { status: 'empty' }
  }
  if (input.length > MAX_JSON_INPUT_CHARS) {
    return { status: 'error', code: 'too-large', line: 1, column: 1 }
  }

  const text = options.keepEscapes ? input : unescapeJsonText(input)
  if (text.trim().length === 0) {
    return { status: 'empty' }
  }

  const errors: ParseError[] = []
  let value: unknown
  try {
    value = parse(text, errors, { allowTrailingComma: false, disallowComments: true })
  } catch {
    // Why: parse() recurses per nesting level, so ~40KB of brackets throws RangeError
    // long before the size guard fires — this result union must never throw.
    return { status: 'error', code: 'too-deep', line: 1, column: 1 }
  }
  const firstError = errors[0]
  if (firstError) {
    return {
      status: 'error',
      code: mapErrorCode(firstError.error),
      ...toLineColumn(text, firstError.offset)
    }
  }
  return { status: 'ok', value }
}
