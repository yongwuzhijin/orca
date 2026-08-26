export const DEFAULT_ORCA_DIR_NAME = '.orca'

/** Structural slice, not `GlobalSettings` — keeps this leaf module free of settings imports. */
export type OrcaDirNameSettingsSlice = {
  workspaceOrcaDirName?: string
  homeOrcaDirName?: string
}

const MAX_SEGMENT_LENGTH = 64
// Why a hard reject, not hygiene: this value is interpolated into POSIX shell strings
// (runtime-home-hook-command.ts) and a PowerShell Join-Path argument (claude/hook-settings.ts),
// so metacharacters here are a command-injection sink. `:` also rules out drive letters,
// `\s` rules out spaces/tabs/newlines and therefore any leading or trailing whitespace.
// Both separators are rejected per segment; the workspace sanitizer splits on `/` first.
const FORBIDDEN_CHARACTERS = /["'`$;&|<>():/\\\s]/
const WINDOWS_RESERVED_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const RESERVED_SEGMENTS = new Set(['.', '..', '.git'])

function isValidSegment(segment: string): boolean {
  if (segment.length === 0 || segment.length > MAX_SEGMENT_LENGTH) {
    return false
  }
  if (RESERVED_SEGMENTS.has(segment)) {
    return false
  }
  // NUL is checked outside the regex — a control character inside one is a lint error.
  if (segment.includes(String.fromCharCode(0))) {
    return false
  }
  return !FORBIDDEN_CHARACTERS.test(segment) && !WINDOWS_RESERVED_DEVICE_NAME.test(segment)
}

export function sanitizeWorkspaceOrcaDirName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  const segments = raw.split('/')
  return segments.every(isValidSegment) ? segments.join('/') : null
}

export function sanitizeHomeOrcaDirName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  return isValidSegment(raw) ? raw : null
}

export function resolveWorkspaceOrcaDirName(
  settings: OrcaDirNameSettingsSlice | null | undefined
): string {
  return sanitizeWorkspaceOrcaDirName(settings?.workspaceOrcaDirName) ?? DEFAULT_ORCA_DIR_NAME
}
