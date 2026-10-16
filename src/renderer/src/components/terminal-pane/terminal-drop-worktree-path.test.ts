import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  joinRuntimeTerminalDropDir,
  resolveTerminalDropWorktreePath
} from './terminal-drop-worktree-path'

const mocks = vi.hoisted(() => {
  const state: {
    detectedWorktreesByRepo: Record<string, never>
    folderWorkspaces: { id: string; folderPath: string; executionHostId: string }[]
    worktreesByRepo: Record<string, { id: string; path: string; hostId: string }[]>
  } = { detectedWorktreesByRepo: {}, folderWorkspaces: [], worktreesByRepo: {} }
  return { state }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))

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

describe('resolveTerminalDropWorktreePath', () => {
  beforeEach(() => {
    mocks.state.folderWorkspaces = []
    mocks.state.worktreesByRepo = {}
  })

  it('resolves folder workspaces through their recorded host', () => {
    mocks.state.folderWorkspaces = [
      { id: 'notes', folderPath: '/folders/notes', executionHostId: 'ssh:host-1' }
    ]
    expect(resolveTerminalDropWorktreePath('folder:notes', undefined, 'ssh:host-1')).toBe(
      '/folders/notes'
    )
    expect(resolveTerminalDropWorktreePath('folder:notes', undefined, 'local')).toBeNull()
  })

  it('resolves the receiving host when the same workspace id exists on two hosts', () => {
    mocks.state.worktreesByRepo = {
      local: [{ id: 'wt-1', path: '/local/repo', hostId: 'local' }],
      remote: [{ id: 'wt-1', path: '/remote/repo', hostId: 'runtime:host-1' }]
    }
    expect(resolveTerminalDropWorktreePath('wt-1', undefined, 'runtime:host-1')).toBe(
      '/remote/repo'
    )
    expect(resolveTerminalDropWorktreePath('wt-1', undefined, 'local')).toBe('/local/repo')
    expect(resolveTerminalDropWorktreePath('wt-1', undefined, 'ssh:unknown')).toBeNull()
  })

  it('preserves a local terminal cwd without granting remote upload roots', () => {
    expect(resolveTerminalDropWorktreePath('missing', '/terminal/cwd', 'local')).toBe(
      '/terminal/cwd'
    )
    expect(resolveTerminalDropWorktreePath('missing', '/terminal/cwd', 'ssh:host-1')).toBeNull()
  })

  it('refuses an unknown workspace or an unknown execution host', () => {
    expect(resolveTerminalDropWorktreePath('missing', undefined, 'local')).toBeNull()
    mocks.state.worktreesByRepo = {
      local: [{ id: 'wt-1', path: '/local/repo', hostId: 'local' }]
    }
    expect(resolveTerminalDropWorktreePath('wt-1', undefined, undefined)).toBeNull()
  })
})
