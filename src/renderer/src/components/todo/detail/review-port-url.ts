import type { WorkspacePort } from '../../../../../shared/workspace-ports'

// Prefer the terminal-advertised origin (Vite prints the real scheme/host); fall
// back to a synthesized origin from the raw listener fields.
export function portToPreviewUrl(port: WorkspacePort): string {
  if (port.kind === 'workspace' && port.advertisedUrl) {
    return port.advertisedUrl
  }
  const scheme = port.protocol === 'https' ? 'https' : 'http'
  return `${scheme}://${port.connectHost}:${port.port}`
}
