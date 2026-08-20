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

type MatchableDetails = Pick<
  Electron.OnBeforeSendHeadersListenerDetails,
  'url' | 'method' | 'resourceType' | 'webContentsId'
>

export function createBrowserNetworkArmedRules(
  resolvePageId: (webContentsId: number) => string | null
): BrowserNetworkArmedRules {
  const rulesByPage = new Map<string, BrowserNetworkRule[]>()

  const matchingMutations = (details: MatchableDetails): BrowserHeaderMutation[] => {
    // Why: requests with no owning WebContents (service workers, prefetches) are never rewritten.
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
    // Why: arming is a snapshot — the caller keeps editing its array as the user edits the panel.
    arm: (browserPageId, rules) => {
      rulesByPage.set(browserPageId, [...rules])
    },
    disarm: (browserPageId) => {
      rulesByPage.delete(browserPageId)
    },
    armedPageIds: () => [...rulesByPage.keys()],
    // Why: handing out the live array would let a reader disarm the page by mutating it.
    rulesFor: (browserPageId) => [...(rulesByPage.get(browserPageId) ?? [])],
    requestHeadersStage: (details, headers) => {
      applyRequestHeaderMutations(headers, matchingMutations(details))
    },
    responseHeadersStage: (details, headers) => {
      applyResponseHeaderMutations(headers, matchingMutations(details))
    }
  }
}
