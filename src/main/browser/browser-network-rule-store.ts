import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  sanitizeBrowserNetworkRule,
  type BrowserNetworkRule
} from '../../shared/browser-network-rule'

export const BROWSER_NETWORK_RULES_FILE_NAME = 'browser-network-rules.json'

// Why: the path arrives as a resolver because app.getPath('userData') throws pre-ready, and the
// throw then lands inside the swallow below instead of taking startup down.
export function loadBrowserNetworkRules(resolveRulesPath: () => string): BrowserNetworkRule[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolveRulesPath(), 'utf-8'))
    const envelope = parsed as { rules?: unknown } | null
    const rules = Array.isArray(parsed) ? parsed : envelope?.rules
    if (!Array.isArray(rules)) {
      return []
    }
    return rules
      .map(sanitizeBrowserNetworkRule)
      .filter((rule): rule is BrowserNetworkRule => rule !== null)
  } catch {
    // A missing file is the normal first-run case, so this stays silent.
    return []
  }
}

// Why: write-temp-then-rename is atomic, so a crash mid-write can't corrupt the live file.
export function persistBrowserNetworkRules(
  resolveRulesPath: () => string,
  rules: BrowserNetworkRule[]
): boolean {
  try {
    const rulesPath = resolveRulesPath()
    const tmpPath = `${rulesPath}.tmp`
    mkdirSync(dirname(rulesPath), { recursive: true })
    writeFileSync(tmpPath, JSON.stringify({ rules }, null, 2))
    renameSync(tmpPath, rulesPath)
    return true
  } catch (error) {
    console.error('[browser-network-rules] persist failed', error)
    return false
  }
}
