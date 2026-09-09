import type { McpConfigInspection } from '../../../../shared/mcp-config'
import { isLikelyDingTalkDocMcpServer } from '../../../../shared/todo/dingtalk-doc-parse-prompt'

export function hasEnabledDingTalkDocMcp(inspections: readonly McpConfigInspection[]): boolean {
  for (const inspection of inspections) {
    if (inspection.status !== 'valid') {
      continue
    }
    for (const server of inspection.servers) {
      if (server.status !== 'enabled') {
        continue
      }
      if (isLikelyDingTalkDocMcpServer(server)) {
        return true
      }
    }
  }
  return false
}
