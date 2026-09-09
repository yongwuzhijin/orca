import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { loadMcpConfigInspections } from '@/components/settings/mcp-config-inspection'
import type { TodoItem } from '../../../../shared/todo/todo-item'
import {
  buildDingTalkDocParsePrompt,
  DINGTALK_DOC_MCP_INSTALL_URL
} from '../../../../shared/todo/dingtalk-doc-parse-prompt'
import { TODO_ACP_ENGINES, type TodoAcpEngine } from '../../../../shared/todo/todo-execution-mode'
import { hasEnabledDingTalkDocMcp } from './dingtalk-prd-mcp'

function resolveDefaultParseEngine(): TodoAcpEngine {
  return TODO_ACP_ENGINES[0] ?? 'qoder'
}

export async function maybeStartPrdParse(args: {
  item: TodoItem
  worktreePath: string
  connectionId?: string
}): Promise<void> {
  if (!args.item.prdLink?.trim()) {
    return
  }

  const inspections = await loadMcpConfigInspections(args.worktreePath, args.connectionId)
  if (!hasEnabledDingTalkDocMcp(inspections)) {
    toast.error(
      translate(
        'auto.components.todo.todoPrdParse.mcpMissing',
        'DingTalk document MCP is not configured. PRD parsing cannot run.'
      ),
      {
        description: DINGTALK_DOC_MCP_INSTALL_URL
      }
    )
    return
  }

  const prompt = buildDingTalkDocParsePrompt(args.worktreePath)
  const executeTask = useAppStore.getState().executeTask
  await executeTask({
    taskId: args.item.id,
    engine: resolveDefaultParseEngine(),
    prompt,
    cwd: args.worktreePath,
    autoPilot: { maxTurns: 15 }
  })
  toast.message(
    translate('auto.components.todo.todoPrdParse.started', 'PRD parsing started in the background.')
  )
}
