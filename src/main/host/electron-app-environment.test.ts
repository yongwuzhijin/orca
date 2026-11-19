import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearOrcaHomeDirNameForTests,
  DEFAULT_ORCA_DIR_NAME,
  getOrcaHomeDirName,
  initializeOrcaHomeDirName
} from '../../shared/orca-home-dir-name'
import { ElectronAppEnvironment } from './electron-app-environment'

vi.mock('electron', () => ({
  app: {}
}))

describe('ElectronAppEnvironment', () => {
  afterEach(() => {
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  it('snapshots the home directory name when the desktop environment is constructed', () => {
    clearOrcaHomeDirNameForTests()

    new ElectronAppEnvironment()

    expect(getOrcaHomeDirName()).toBe(DEFAULT_ORCA_DIR_NAME)
  })
})
