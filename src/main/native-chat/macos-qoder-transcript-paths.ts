import { homedir } from 'node:os'
import { join } from 'node:path'

/** Qoder CLI / IDE session transcripts live here (Claude-shaped JSONL). */
export function macosQoderProjectsRoot(homeDir: string = homedir()): string {
  return join(homeDir, '.qoder', 'projects')
}

/**
 * On macOS, Qoder marks transcript files so only Qoder's own binaries (or plain
 * Node) can open them; Electron helpers get EPERM. Delegate reads to plain Node.
 */
export function isMacosQoderTranscriptPath(
  path: string,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = homedir()
): boolean {
  if (platform !== 'darwin' || !path.endsWith('.jsonl')) {
    return false
  }
  const root = macosQoderProjectsRoot(homeDir).replace(/\\/g, '/')
  const normalized = path.replace(/\\/g, '/')
  return normalized === root || normalized.startsWith(`${root}/`)
}

/** Claude-shaped JSONL under ~/.qoder/projects must never surface as Claude. */
export function macosQoderTranscriptAgentOverride(
  path: string,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = homedir()
): 'qoder' | null {
  return isMacosQoderTranscriptPath(path, platform, homeDir) ? 'qoder' : null
}
