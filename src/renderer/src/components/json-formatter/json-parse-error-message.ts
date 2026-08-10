import { translate } from '@/i18n/i18n'
import {
  MAX_JSON_INPUT_BYTES,
  type JsonParseErrorCode,
  type JsonParseResult
} from './parse-json-input'

function describeCode(code: JsonParseErrorCode): string {
  switch (code) {
    case 'too-large':
      return translate(
        'auto.components.jsonFormatter.error.tooLarge.3af12b9c40',
        'Content is too large to preview (limit {{limit}} MB).',
        { limit: MAX_JSON_INPUT_BYTES / (1024 * 1024) }
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
  if (result.code === 'too-large') {
    return message
  }
  const position = translate(
    'auto.components.jsonFormatter.error.position.44a2c0e8fb',
    'Line {{line}}, column {{column}}',
    { line: result.line, column: result.column }
  )
  return `${message} ${position}`
}
