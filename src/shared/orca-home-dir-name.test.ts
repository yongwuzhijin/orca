import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadModule() {
  vi.resetModules()
  return await import('./orca-home-dir-name.js')
}

describe('orca home dir name snapshot', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  // Why: the snapshot lives on the realm, so a cleared or renamed slot would leak into
  // every later suite that relies on the shared vitest seed.
  afterEach(async () => {
    const { initializeOrcaHomeDirName, DEFAULT_ORCA_DIR_NAME } = await loadModule()
    initializeOrcaHomeDirName(DEFAULT_ORCA_DIR_NAME)
  })

  it('throws when read before initialization', async () => {
    const { getOrcaHomeDirName, clearOrcaHomeDirNameForTests } = await loadModule()
    clearOrcaHomeDirNameForTests()
    expect(() => getOrcaHomeDirName()).toThrow('orca_home_dir_name_not_initialized')
  })

  it('returns the initialized name', async () => {
    const { initializeOrcaHomeDirName, getOrcaHomeDirName } = await loadModule()
    initializeOrcaHomeDirName('.orca-dev')
    expect(getOrcaHomeDirName()).toBe('.orca-dev')
  })

  it('falls back to the default for a rejected name', async () => {
    const { initializeOrcaHomeDirName, getOrcaHomeDirName } = await loadModule()
    initializeOrcaHomeDirName('$(whoami)')
    expect(getOrcaHomeDirName()).toBe('.orca')
  })

  it('falls back to the default when unset', async () => {
    const { initializeOrcaHomeDirName, getOrcaHomeDirName } = await loadModule()
    initializeOrcaHomeDirName(undefined)
    expect(getOrcaHomeDirName()).toBe('.orca')
  })

  it('reads the name from the environment', async () => {
    const { initializeOrcaHomeDirNameFromEnvironment, getOrcaHomeDirName } = await loadModule()
    initializeOrcaHomeDirNameFromEnvironment({ ORCA_HOME_DIR_NAME: '.orca-ci' })
    expect(getOrcaHomeDirName()).toBe('.orca-ci')
  })

  it('falls back to the default for an empty environment', async () => {
    const { initializeOrcaHomeDirNameFromEnvironment, getOrcaHomeDirName } = await loadModule()
    initializeOrcaHomeDirNameFromEnvironment({})
    expect(getOrcaHomeDirName()).toBe('.orca')
  })
})
