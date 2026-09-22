import type { AiVaultSession } from '../../shared/ai-vault-types'
import type { RemoteSessionContent } from './remote-session-content-lines'
import type { RemoteParserOptions } from './remote-session-scanner-types'
import { parseClaudeSessionContent } from './session-scanner-primary-parsers'
import type { FileWithMtime } from './session-scanner-types'

export const REMOTE_QODER_PROJECTS_SEGMENTS = ['.qoder', 'projects'] as const

// Why: Qoder writes Claude-shaped JSONL under its own home (verified against
// qodercli v1.1.3), so the Claude parser is reused with the qoder agent label.
export function parseRemoteQoderSessionContent(
  file: FileWithMtime,
  content: RemoteSessionContent,
  platform: NodeJS.Platform,
  options: RemoteParserOptions,
  signal?: AbortSignal
): Promise<AiVaultSession | null> {
  return parseClaudeSessionContent(file, content, platform, options, signal, 'qoder')
}
