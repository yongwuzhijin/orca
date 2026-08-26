import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_ORCA_DIR_NAME, initializeOrcaHomeDirName } from '../../shared/orca-home-dir-name'
import { wrapRuntimeHomeHookCommand } from './runtime-home-hook-command'

describe('wrapRuntimeHomeHookCommand honours the configured home directory name', () => {
  // Why: the snapshot is process-wide, so a rename here would leak into every later suite.
  afterEach(() => {
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  it('names the configured directory in both POSIX branches', () => {
    initializeOrcaHomeDirName('.orca-ci')
    const command = wrapRuntimeHomeHookCommand('claude-hook')
    expect(command).toContain('"${HOME-}/.orca-ci/agent-hooks/claude-hook.sh"')
    expect(command).toContain('"${HOME-}/.orca-ci/agent-hooks/claude-hook.cmd"')
    expect(command).not.toContain('/.orca/agent-hooks/')
  })

  it('names the configured directory inside the PowerShell EncodedCommand', () => {
    initializeOrcaHomeDirName('.orca-ci')
    const command = wrapRuntimeHomeHookCommand('claude-hook')
    const encoded = command.match(/-EncodedCommand (\S+)/)?.[1]
    expect(encoded).toBeTruthy()
    const decoded = Buffer.from(encoded as string, 'base64').toString('utf16le')
    expect(decoded).toContain("'.orca-ci\\agent-hooks\\claude-hook.cmd'")
  })
})
