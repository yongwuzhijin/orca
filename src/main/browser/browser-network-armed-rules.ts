import {
  applyRequestHeaderMutations,
  applyResponseHeaderMutations
} from '../../shared/browser-network-header-mutation'
import {
  matchesBrowserNetworkRule,
  type BrowserHeaderMutation,
  type BrowserNetworkRule
} from '../../shared/browser-network-rule'
import type {
  BrowserRequestHeadersStage,
  BrowserResponseHeadersStage
} from './browser-session-request-pipeline'

export type BrowserNetworkArmedRules = {
  arm: (browserPageId: string, rules: BrowserNetworkRule[]) => void
  disarm: (browserPageId: string) => void
  armedPageIds: () => string[]
  rulesFor: (browserPageId: string) => BrowserNetworkRule[]
  requestHeadersStage: BrowserRequestHeadersStage
  responseHeadersStage: BrowserResponseHeadersStage
}

type MatchableDetails = {
  url: string
  method: string
  resourceType: string
  webContentsId?: number
}

export function createBrowserNetworkArmedRules(
  resolvePageId: (webContentsId: number) => string | null
): BrowserNetworkArmedRules {
  const rulesByPage = new Map<string, BrowserNetworkRule[]>()

  // Why: requests with no owning WebContents (service workers, some prefetches) are never
  // rewritten — there is no page to attribute them to, so there is no armed rule set to apply.
  const matchingMutations = (details: MatchableDetails): BrowserHeaderMutation[] => {
    const webContentsId = details.webContentsId
    if (typeof webContentsId !== 'number') {
      return []
    }
    const browserPageId = resolvePageId(webContentsId)
    if (!browserPageId) {
      return []
    }
    const rules = rulesByPage.get(browserPageId)
    if (!rules || rules.length === 0) {
      return []
    }
    const facts = {
      url: details.url,
      method: details.method,
      resourceType: details.resourceType
    }
    return rules
      .filter((rule) => matchesBrowserNetworkRule(rule, facts))
      .flatMap((rule) => rule.headers)
  }

  return {
    arm: (browserPageId, rules) => {
      rulesByPage.set(browserPageId, rules)
    },
    disarm: (browserPageId) => {
      rulesByPage.delete(browserPageId)
    },
    armedPageIds: () => [...rulesByPage.keys()],
    rulesFor: (browserPageId) => rulesByPage.get(browserPageId) ?? [],
    requestHeadersStage: (details, headers) => {
      applyRequestHeaderMutations(headers, matchingMutations(details))
    },
    responseHeadersStage: (details, headers) => {
      applyResponseHeaderMutations(headers, matchingMutations(details))
    }
  }
}
