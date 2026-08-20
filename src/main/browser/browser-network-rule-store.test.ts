import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BROWSER_NETWORK_RULES_FILE_NAME,
  loadBrowserNetworkRules,
  persistBrowserNetworkRules
} from './browser-network-rule-store'
import type { BrowserNetworkRule } from '../../shared/browser-network-rule'

const dirs: string[] = []

function createRulesPath(): () => string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-network-rules-'))
  dirs.push(dir)
  return () => join(dir, BROWSER_NETWORK_RULES_FILE_NAME)
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

const RULE: BrowserNetworkRule = {
  id: 'r1',
  label: 'staging auth',
  enabled: true,
  match: { urlPattern: 'https://api.example.com/*', methods: undefined, resourceTypes: undefined },
  headers: [{ target: 'request', op: 'set', name: 'Authorization', value: 'Bearer x' }]
}

describe('browser network rule store', () => {
  it('returns an empty list when the file does not exist', () => {
    expect(loadBrowserNetworkRules(createRulesPath())).toEqual([])
  })

  it('round-trips a rule through disk', () => {
    const resolvePath = createRulesPath()
    expect(persistBrowserNetworkRules(resolvePath, [RULE])).toBe(true)
    expect(loadBrowserNetworkRules(resolvePath)).toEqual([RULE])
  })

  it('writes the file under the documented name with a rules envelope', () => {
    const resolvePath = createRulesPath()
    persistBrowserNetworkRules(resolvePath, [RULE])
    expect(resolvePath().endsWith('browser-network-rules.json')).toBe(true)
    expect(JSON.parse(readFileSync(resolvePath(), 'utf-8')).rules).toHaveLength(1)
  })

  it('leaves no temp file behind', () => {
    const resolvePath = createRulesPath()
    persistBrowserNetworkRules(resolvePath, [RULE])
    expect(() => readFileSync(`${resolvePath()}.tmp`, 'utf-8')).toThrow()
  })

  it('returns an empty list for unparseable JSON instead of throwing', () => {
    const resolvePath = createRulesPath()
    persistBrowserNetworkRules(resolvePath, [])
    writeFileSync(resolvePath(), '{ not json', 'utf-8')
    expect(loadBrowserNetworkRules(resolvePath)).toEqual([])
  })

  it('drops rules that fail sanitization and keeps the rest', () => {
    const resolvePath = createRulesPath()
    persistBrowserNetworkRules(resolvePath, [])
    writeFileSync(
      resolvePath(),
      JSON.stringify({ rules: [RULE, { label: 'no id' }, { id: 'r3', match: {} }] }),
      'utf-8'
    )
    expect(loadBrowserNetworkRules(resolvePath).map((rule) => rule.id)).toEqual(['r1'])
  })

  it('reads a bare array for forward tolerance', () => {
    const resolvePath = createRulesPath()
    persistBrowserNetworkRules(resolvePath, [])
    writeFileSync(resolvePath(), JSON.stringify([RULE]), 'utf-8')
    expect(loadBrowserNetworkRules(resolvePath)).toEqual([RULE])
  })

  it('reports failure instead of throwing when the path is unwritable', () => {
    expect(
      persistBrowserNetworkRules(() => join(tmpdir(), 'orca-network-rules-\0bad'), [RULE])
    ).toBe(false)
  })
})
