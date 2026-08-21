import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { translate } from '@/i18n/i18n'
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
      setError(
        result.reason === 'no_guest'
          ? translate(
              'browser.networkTools.armFailedNoGuest',
              'Rules could not be armed — this tab has no live page yet.'
            )
          : translate(
              'browser.networkTools.armFailedUnknown',
              'Rules could not be armed — save your edits first.'
            )
      )
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
      {visibleRules.map((rule) => {
        const header = rule.headers[0]
        return (
          <div key={rule.id} className="flex items-center gap-1.5">
            <Checkbox
              aria-label={`${translate('browser.networkTools.arm', 'Arm')} ${rule.label}`}
              checked={selected.includes(rule.id)}
              onCheckedChange={(checked) =>
                setSelected((prev) =>
                  checked ? [...prev, rule.id] : prev.filter((id) => id !== rule.id)
                )
              }
            />
            <Input
              className="h-7 w-32 text-xs"
              aria-label={translate('browser.networkTools.ruleLabelField', 'Rule label')}
              value={rule.label}
              onChange={(event) => patchRule(rule.id, { label: event.target.value })}
            />
            <Input
              className="h-7 flex-1 text-xs"
              aria-label={translate('browser.networkTools.urlPatternField', 'URL pattern')}
              value={rule.match.urlPattern}
              onChange={(event) =>
                patchRule(rule.id, { match: { ...rule.match, urlPattern: event.target.value } })
              }
            />
            <Input
              className="h-7 w-36 text-xs"
              aria-label={translate('browser.networkTools.headerName', 'Header')}
              placeholder={translate('browser.networkTools.headerName', 'Header')}
              value={header?.name ?? ''}
              onChange={(event) => patchHeader(rule.id, { name: event.target.value })}
            />
            <Input
              className="h-7 w-36 text-xs"
              aria-label={translate('browser.networkTools.headerValue', 'Value')}
              placeholder={translate('browser.networkTools.headerValue', 'Value')}
              value={header?.value ?? ''}
              onChange={(event) => patchHeader(rule.id, { value: event.target.value })}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={`${translate('browser.networkTools.delete', 'Delete')} ${rule.label}`}
              onClick={() => void persist(rules.filter((candidate) => candidate.id !== rule.id))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}
