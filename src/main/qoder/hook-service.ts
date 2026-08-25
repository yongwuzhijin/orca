import { ClaudeHookService } from '../claude/hook-service'
import { QODER_HOOK_SETTINGS } from '../claude/hook-settings'

export const qoderHookService = new ClaudeHookService({
  agent: 'qoder',
  displayName: 'Qoder',
  settings: QODER_HOOK_SETTINGS
})
