import { ParseErrorCode, type ParseError, parse } from 'jsonc-parser'
import { unescapeJsonText } from './json-unescape'

export const MAX_JSON_INPUT_BYTES = 5 * 1024 * 1024

export type JsonParseErrorCode =
  | 'too-large'
  | 'unexpected-end'
  | 'invalid-symbol'
  | 'invalid-number'
  | 'trailing-content'
  | 'syntax'

export type JsonParseResult =
  | { status: 'empty' }
  | { status: 'ok'; value: unknown }
  | { status: 'error'; code: JsonParseErrorCode; line: number; column: number }

function mapErrorCode(error: ParseError['error']): JsonParseErrorCode {
  switch (error) {
    case ParseErrorCode.UnexpectedEndOfObject:
    case ParseErrorCode.UnexpectedEndOfArray:
    case ParseErrorCode.UnexpectedEndOfString:
    case ParseErrorCode.UnexpectedEndOfComment:
      return 'unexpected-end'
    case ParseErrorCode.InvalidSymbol:
      return 'invalid-symbol'
    case ParseErrorCode.InvalidNumberFormat:
      return 'invalid-number'
    case ParseErrorCode.EndOfFileExpected:
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
  if (input.length > MAX_JSON_INPUT_BYTES) {
    return { status: 'error', code: 'too-large', line: 1, column: 1 }
  }

  const text = options.keepEscapes ? input : unescapeJsonText(input)
  if (text.trim().length === 0) {
    return { status: 'empty' }
  }

  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: false, disallowComments: true })
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
