import { describe, expect, it } from 'vitest'
import { getDefaultSettings } from './constants'
import { DEFAULT_ORCA_DIR_NAME } from './orca-dir-names'

describe('getDefaultSettings orca directory names', () => {
  it('writes both names explicitly so they are discoverable in the settings file', () => {
    const settings = getDefaultSettings('/home/tester')
    expect(settings.workspaceOrcaDirName).toBe(DEFAULT_ORCA_DIR_NAME)
    expect(settings.homeOrcaDirName).toBe(DEFAULT_ORCA_DIR_NAME)
  })
})
