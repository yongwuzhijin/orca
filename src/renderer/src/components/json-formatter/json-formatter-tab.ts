import { translate } from '@/i18n/i18n'

const JSON_FORMATTER_TAB_SUFFIX = '::json-formatter'

export function buildJsonFormatterTabId(worktreeId: string): string {
  return `${worktreeId}${JSON_FORMATTER_TAB_SUFFIX}`
}

export function getJsonFormatterTabLabel(): string {
  return translate('auto.components.jsonFormatter.tab.9b1c4d7e02', 'JSON Formatter')
}
