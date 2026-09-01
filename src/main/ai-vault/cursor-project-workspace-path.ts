import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { extractString, parseJsonObject } from './session-scanner-values'

/** Cursor stores agent transcripts under `<projectDir>/agent-transcripts/`. */
export function cursorProjectDirFromAgentTranscriptPath(filePath: string): string | null {
  let dir = dirname(filePath)
  if (basename(dir) === 'agent-transcripts') {
    return dirname(dir)
  }
  dir = dirname(dir)
  if (basename(dir) === 'agent-transcripts') {
    return dirname(dir)
  }
  return null
}

/** Cursor writes the trusted workspace cwd beside transcripts in `.workspace-trusted`. */
export function readCursorProjectWorkspacePathSync(projectDir: string): string | null {
  try {
    const record = parseJsonObject(readFileSync(join(projectDir, '.workspace-trusted'), 'utf8'))
    if (!record) {
      return null
    }
    const workspacePath = extractString(record.workspacePath)?.trim()
    return workspacePath || null
  } catch {
    return null
  }
}

export function resolveCursorSessionCwdFromPath(filePath: string): string | null {
  const projectDir = cursorProjectDirFromAgentTranscriptPath(filePath)
  if (!projectDir) {
    return null
  }
  return readCursorProjectWorkspacePathSync(projectDir)
}

export function extractWorkingDirectoryFromCursorRecord(
  record: Record<string, unknown>
): string | null {
  const message = record.message
  if (!message || typeof message !== 'object') {
    return null
  }
  const content = (message as Record<string, unknown>).content
  if (!Array.isArray(content)) {
    return null
  }
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const block = item as Record<string, unknown>
    if (block.type !== 'tool_use') {
      continue
    }
    const input = block.input
    if (!input || typeof input !== 'object') {
      continue
    }
    const workingDirectory = extractString((input as Record<string, unknown>).working_directory)
    if (workingDirectory) {
      return workingDirectory
    }
  }
  return null
}
