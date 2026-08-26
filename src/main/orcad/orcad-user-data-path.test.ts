import { describe, expect, it } from 'vitest'
import { resolveOrcadUserDataPath } from './orcad-entry'

describe('resolveOrcadUserDataPath', () => {
  it('prefers ORCA_USER_DATA above everything', () => {
    expect(
      resolveOrcadUserDataPath(
        {
          ORCA_USER_DATA: '/explicit',
          XDG_DATA_HOME: '/xdg',
          ORCA_HOME_DIR_NAME: '.orca-dev'
        },
        '/home/tester'
      )
    ).toBe('/explicit')
  })

  it('prefers XDG_DATA_HOME/Orca over the home directory name', () => {
    expect(
      resolveOrcadUserDataPath(
        { XDG_DATA_HOME: '/xdg', ORCA_HOME_DIR_NAME: '.orca-dev' },
        '/home/tester'
      )
    ).toBe('/xdg/Orca')
  })

  it('uses ORCA_HOME_DIR_NAME under $HOME when no other override is set', () => {
    expect(resolveOrcadUserDataPath({ ORCA_HOME_DIR_NAME: '.orca-dev' }, '/home/tester')).toBe(
      '/home/tester/.orca-dev'
    )
  })

  it('falls back to .orca when ORCA_HOME_DIR_NAME is unset', () => {
    expect(resolveOrcadUserDataPath({}, '/home/tester')).toBe('/home/tester/.orca')
  })

  it('falls back to .orca when ORCA_HOME_DIR_NAME is invalid', () => {
    expect(resolveOrcadUserDataPath({ ORCA_HOME_DIR_NAME: '../escape' }, '/home/tester')).toBe(
      '/home/tester/.orca'
    )
  })
})
