import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ORCA_DIR_NAME, initializeOrcaHomeDirName } from '../shared/orca-home-dir-name'
import { orcaHomeDir, orcaHomeDirPath } from './orca-home-dir-path'

describe('orcaHomeDirPath', () => {
  beforeEach(() => {
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  // Why: the snapshot is process-wide, so a rename here would leak into every later suite.
  afterEach(() => {
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  it('uses the snapshot name under the supplied home', () => {
    expect(orcaHomeDir('/home/me')).toBe(join('/home/me', '.orca'))
  })

  it('joins trailing segments', () => {
    initializeOrcaHomeDirName('.orca-ci')
    expect(orcaHomeDirPath('agent-hooks', 'claude-hook.sh')).toContain(
      join('.orca-ci', 'agent-hooks', 'claude-hook.sh')
    )
  })

  it('falls back to the default for an invalid snapshot value', () => {
    initializeOrcaHomeDirName('../escape')
    expect(orcaHomeDir('/home/me')).toBe(join('/home/me', '.orca'))
  })
})
