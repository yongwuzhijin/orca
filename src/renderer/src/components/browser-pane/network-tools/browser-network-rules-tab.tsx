import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { BrowserNetworkRuleRow } from './browser-network-rule-row'
import type {
  BrowserHeaderMutation,
  BrowserNetworkRule
} from '../../../../../shared/browser-network-rule'

const DEFAULT_PATTERN = 'https://*'

function createRule(): BrowserNetworkRule {
  return {
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: translate('browser.networkTools.newRuleLabel', 'New rule'),
    enabled: true,
    match: { urlPattern: DEFAULT_PATTERN },
    headers: [{ target: 'request', op: 'set', name: '', value: '' }]
  }
}

export function BrowserNetworkRulesTab({
  browserPageId
}: {
  browserPageId: string
}): React.JSX.Element {
  const [rules, setRules] = useState<BrowserNetworkRule[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [armedRuleIds, setArmedRuleIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      window.api.browser.networkListRules(),
      window.api.browser.networkReadArmedRules({ browserPageId })
    ])
      .then(([saved, armed]) => {
        if (cancelled) {
          return
        }
        setRules(saved)
        setArmedRuleIds(armed.armedRuleIds)
        // Why: the checkbox is what arms a rule, so leaving an already-armed rule unchecked reads as
        // the opposite of what the page is doing, and keeps Arm disabled until it is re-checked.
        setSelected(armed.armedRuleIds)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setError(translate('browser.networkTools.loadFailed', 'Rules could not be loaded.'))
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [browserPageId])

  const persist = useCallback(async (next: BrowserNetworkRule[]) => {
    setRules(next)
    const liveIds = new Set(next.map((rule) => rule.id))
    setSelected((prev) => prev.filter((id) => liveIds.has(id)))
    setArmedRuleIds((prev) => prev.filter((id) => liveIds.has(id)))
    const ok = await window.api.browser.networkSaveRules({ rules: next })
    if (!ok) {
      setError(translate('browser.networkTools.saveFailed', 'Rules could not be saved.'))
    }
  }, [])

  const patchRule = useCallback(
    (id: string, patch: Partial<BrowserNetworkRule>) => {
      void persist(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
    },
    [persist, rules]
  )

  const patchHeader = useCallback(
    (id: string, patch: Partial<BrowserHeaderMutation>) => {
      const rule = rules.find((candidate) => candidate.id === id)
      if (!rule) {
        return
      }
      const head = rule.headers[0] ?? { target: 'request' as const, op: 'set' as const, name: '' }
      patchRule(id, { headers: [{ ...head, ...patch }, ...rule.headers.slice(1)] })
    },
    [patchRule, rules]
  )

  const arm = useCallback(async () => {
    setError(null)
    const result = await window.api.browser.networkArmRules({ browserPageId, ruleIds: selected })
    setArmedRuleIds(result.armedRuleIds)
    if (!result.armed) {
      if (result.reason === 'no_guest') {
        setError(
          translate(
            'browser.networkTools.armFailedNoGuest',
            'Rules could not be armed — this tab has no live page yet.'
          )
        )
      } else if (result.reason === 'cdp_error') {
        setError(
          translate(
            'browser.networkTools.armFailedCdp',
            'Rules could not be armed — close DevTools for this tab and try again.'
          )
        )
      } else {
        setError(
          translate(
            'browser.networkTools.armFailedUnknown',
            'Rules could not be armed — save your edits first.'
          )
        )
      }
    }
  }, [browserPageId, selected])

  const disarm = useCallback(async () => {
    await window.api.browser.networkDisarmRules({ browserPageId })
    setArmedRuleIds([])
    setError(null)
  }, [browserPageId])

  const visibleRules = loaded ? rules : []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          // Why: adding before the load settles would let the resolved list clobber the new rule.
          disabled={!loaded}
          onClick={() => void persist([...rules, createRule()])}
        >
          {translate('browser.networkTools.addRule', 'Add rule')}
        </Button>
        <Button
          size="sm"
          className="h-7"
          disabled={selected.length === 0}
          onClick={() => void arm()}
        >
          {translate('browser.networkTools.arm', 'Arm')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={armedRuleIds.length === 0}
          onClick={() => void disarm()}
        >
          {translate('browser.networkTools.disarm', 'Disarm')}
        </Button>
        {armedRuleIds.length > 0 ? (
          <span className="text-[11px] text-amber-600">
            {translate('browser.networkTools.armedCount', '{{count}} armed', {
              count: armedRuleIds.length
            })}
          </span>
        ) : null}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {loaded && rules.length === 0 && !error ? (
        <p className="text-muted-foreground">
          {translate('browser.networkTools.noRules', 'No rules yet. Add one to rewrite headers.')}
        </p>
      ) : null}
      {visibleRules.map((rule) => (
        <BrowserNetworkRuleRow
          key={rule.id}
          rule={rule}
          selected={selected.includes(rule.id)}
          onSelectedChange={(checked) =>
            setSelected((prev) =>
              checked ? [...prev, rule.id] : prev.filter((id) => id !== rule.id)
            )
          }
          onPatchRule={(patch) => patchRule(rule.id, patch)}
          onPatchHeader={(patch) => patchHeader(rule.id, patch)}
          onDelete={() => void persist(rules.filter((candidate) => candidate.id !== rule.id))}
        />
      ))}
    </div>
  )
}
