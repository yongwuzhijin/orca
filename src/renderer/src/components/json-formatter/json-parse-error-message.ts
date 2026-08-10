import { translate } from '@/i18n/i18n'
import type { JsonParseErrorCode, JsonParseResult } from './parse-json-input'

// Why: both are whole-input verdicts, so their line/column is fabricated, not derived.
const CODES_WITHOUT_POSITION = new Set<JsonParseErrorCode>(['too-large', 'too-deep'])

function describeCode(code: JsonParseErrorCode): string {
  switch (code) {
    // Why: no threshold — it is not actionable, and a UTF-16 code-unit count reads worse
    // than no number at all.
    case 'too-large':
      return translate(
        'auto.components.jsonFormatter.error.tooLarge.a3e7b3ed6a',
        'Content is too large to preview.'
      )
    case 'too-deep':
      return translate(
        'auto.components.jsonFormatter.error.tooDeep.a97483a5ec',
        'JSON is nested too deeply to preview.'
      )
    case 'unexpected-end':
      return translate(
        'auto.components.jsonFormatter.error.unexpectedEnd.7d05ea1f66',
        'Unexpected end of JSON input.'
      )
    case 'invalid-symbol':
      return translate(
        'auto.components.jsonFormatter.error.invalidSymbol.5c8b30de71',
        'Unexpected token in JSON.'
      )
    case 'invalid-number':
      return translate(
        'auto.components.jsonFormatter.error.invalidNumber.2e6f94ba18',
        'Invalid number format in JSON.'
      )
    case 'trailing-content':
      return translate(
        'auto.components.jsonFormatter.error.trailingContent.9014cbe7d3',
        'Unexpected content after the end of JSON.'
      )
    default:
      return translate(
        'auto.components.jsonFormatter.error.syntax.61bd7f4a29',
        'Invalid JSON syntax.'
      )
  }
}

export function describeJsonParseError(
  result: Extract<JsonParseResult, { status: 'error' }>
): string {
  const message = describeCode(result.code)
  if (CODES_WITHOUT_POSITION.has(result.code)) {
    return message
  }
  const position = translate(
    'auto.components.jsonFormatter.error.position.44a2c0e8fb',
    'Line {{line}}, column {{column}}',
    { line: result.line, column: result.column }
  )
  return `${message} ${position}`
}
