import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TAB_CREATE_MENU_QUERY_MAX_BYTES,
  buildTabCreateMenuOptions,
  findMatchingTabCreateMenuOptions,
  isTabCreateMenuQueryTooLarge,
  type TabCreateMenuOption
} from './tab-create-menu-options'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tab create menu options', () => {
  const defaultOptions = buildTabCreateMenuOptions({
    terminalOnly: false,
    hasNewBrowser: true,
    hasNewMarkdown: true,
    hasOpenMarkdown: true,
    hasSimulator: true,
    simulatorIsGoTo: false
  })

  it('matches mobile emulator aliases to the simulator menu action', () => {
    expect(
      findMatchingTabCreateMenuOptions('mobile emulator', defaultOptions).map(
        (option) => option.kind
      )
    ).toEqual(['new-simulator'])
  })

  it('matches go-to simulator when the workspace already has one', () => {
    const options = buildTabCreateMenuOptions({
      terminalOnly: false,
      hasNewBrowser: true,
      hasNewMarkdown: true,
      hasOpenMarkdown: false,
      hasSimulator: true,
      simulatorIsGoTo: true
    })

    expect(
      findMatchingTabCreateMenuOptions('simulator', options).map((option) => option.kind)
    ).toEqual(['go-to-simulator'])
  })

  it('matches terminal and browser quick actions', () => {
    expect(
      findMatchingTabCreateMenuOptions('new terminal', defaultOptions).map((option) => option.kind)
    ).toEqual(['new-terminal'])
    expect(
      findMatchingTabCreateMenuOptions('browser', defaultOptions).map((option) => option.kind)
    ).toEqual(['new-browser'])
  })

  it('preserves default Windows shell order for tied terminal matches', () => {
    const options = buildTabCreateMenuOptions({
      terminalOnly: false,
      hasNewBrowser: false,
      hasNewMarkdown: false,
      hasOpenMarkdown: false,
      hasSimulator: false,
      simulatorIsGoTo: false,
      windowsShellEntries: [
        { label: 'PowerShell', shell: 'powershell.exe' },
        { label: 'CMD Prompt', shell: 'cmd.exe' }
      ]
    })

    expect(
      findMatchingTabCreateMenuOptions('new terminal', options).map((option) => option.shell)
    ).toEqual(['powershell.exe', 'cmd.exe'])
  })

  it('returns no matches for an empty query', () => {
    expect(findMatchingTabCreateMenuOptions('', defaultOptions)).toEqual([])
    expect(findMatchingTabCreateMenuOptions('   ', defaultOptions)).toEqual([])
  })

  it('matches accepted pasted queries without whitespace regex replacement', () => {
    const replace = vi.spyOn(String.prototype, 'replace')
    const nonBreakingSpace = String.fromCharCode(160)
    const query = ['\tnew', nonBreakingSpace, '  terminal\n'].join('')

    expect(
      findMatchingTabCreateMenuOptions(query, defaultOptions).map((option) => option.kind)
    ).toEqual(['new-terminal'])
    expect(
      replace.mock.calls.filter(
        ([pattern]) => pattern instanceof RegExp && pattern.source === '\\s+'
      )
    ).toHaveLength(0)
  })

  describe('json formatter option', () => {
    const withTool = (hasJsonFormatter: boolean, terminalOnly = false): TabCreateMenuOption[] =>
      buildTabCreateMenuOptions({
        terminalOnly,
        hasNewBrowser: true,
        hasNewMarkdown: true,
        hasOpenMarkdown: true,
        hasSimulator: true,
        simulatorIsGoTo: false,
        hasJsonFormatter
      })

    it('is offered when the tool is available', () => {
      expect(withTool(true).map((option) => option.kind)).toContain('new-json-formatter')
    })

    it('is searchable by json and by its own label', () => {
      const options = withTool(true)
      const label = options.find((option) => option.kind === 'new-json-formatter')?.label ?? ''

      expect(
        findMatchingTabCreateMenuOptions('json', options).map((option) => option.kind)
      ).toContain('new-json-formatter')
      expect(findMatchingTabCreateMenuOptions(label, options).map((option) => option.kind)).toEqual(
        ['new-json-formatter']
      )
    })

    it('is hidden when the tool is unavailable', () => {
      expect(withTool(false).map((option) => option.kind)).not.toContain('new-json-formatter')
    })

    it('is hidden in terminal-only mode', () => {
      expect(withTool(true, true).map((option) => option.kind)).not.toContain('new-json-formatter')
    })
  })

  it('rejects oversized pasted queries before scoring menu options', () => {
    const oversizedQuery = 'secret-tab-create-menu'.repeat(TAB_CREATE_MENU_QUERY_MAX_BYTES)
    const option = {
      id: 'new-terminal',
      kind: 'new-terminal',
      get label(): string {
        throw new Error('oversized tab-create menu queries must not scan labels')
      },
      get keywords(): readonly string[] {
        throw new Error('oversized tab-create menu queries must not scan keywords')
      }
    } as TabCreateMenuOption

    expect(isTabCreateMenuQueryTooLarge(oversizedQuery)).toBe(true)
    expect(findMatchingTabCreateMenuOptions(oversizedQuery, [option])).toEqual([])
  })
})
