import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ORCA_DIR_NAME, initializeOrcaHomeDirName } from '../../shared/orca-home-dir-name'
import { remoteHomeAgentHookScriptPath } from './remote-home-hook-script-path'

describe('remoteHomeAgentHookScriptPath', () => {
  beforeEach(() => {
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  // Why: the snapshot is process-wide, so a rename here would leak into every later suite.
  afterEach(() => {
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  it('builds a posix path under the remote home', () => {
    expect(remoteHomeAgentHookScriptPath('/home/deploy', 'claude-hook.sh')).toBe(
      '/home/deploy/.orca/agent-hooks/claude-hook.sh'
    )
  })

  it('strips a trailing slash from the remote home', () => {
    expect(remoteHomeAgentHookScriptPath('/home/deploy/', 'codex-hook.sh')).toBe(
      '/home/deploy/.orca/agent-hooks/codex-hook.sh'
    )
  })

  it('keeps the filesystem root absolute', () => {
    expect(remoteHomeAgentHookScriptPath('/', 'codex-hook.sh')).toBe(
      '/.orca/agent-hooks/codex-hook.sh'
    )
  })

  it('uses the configured home directory name', () => {
    initializeOrcaHomeDirName('.orca-ci')
    expect(remoteHomeAgentHookScriptPath('/home/deploy', 'grok-hook.sh')).toBe(
      '/home/deploy/.orca-ci/agent-hooks/grok-hook.sh'
    )
  })
})
