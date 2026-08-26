import { describe, expect, it } from 'vitest'
import { joinRuntimeTerminalDropDir } from './terminal-drop-worktree-path'

describe('joinRuntimeTerminalDropDir', () => {
  it('uses the default name on posix', () => {
    expect(joinRuntimeTerminalDropDir('/home/me/repo', '.orca')).toBe('/home/me/repo/.orca/drops')
  })

  it('uses the configured name on posix and strips a trailing separator', () => {
    expect(joinRuntimeTerminalDropDir('/home/me/repo/', '.tmp/orca')).toBe(
      '/home/me/repo/.tmp/orca/drops'
    )
  })

  it('converts the configured name to backslashes on windows-like paths', () => {
    expect(joinRuntimeTerminalDropDir('C:\\src\\repo\\', '.tmp/orca')).toBe(
      'C:\\src\\repo\\.tmp\\orca\\drops'
    )
  })
})
