const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return '—'
  }
  if (ms < MINUTE) {
    return `${Math.round(ms / SECOND)}s`
  }
  if (ms < HOUR) {
    return `${Math.round(ms / MINUTE)}m`
  }
  if (ms < DAY) {
    return `${Math.round(ms / HOUR)}h`
  }
  return `${Math.round(ms / DAY)}d`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`
  }
  return `${n}`
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`
}
