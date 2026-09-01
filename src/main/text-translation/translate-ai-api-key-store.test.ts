import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
  encryptString: vi.fn((value: string) => Buffer.from(value)),
  isEncryptionAvailable: vi.fn(() => true)
}))

let tempHome = ''

async function loadStoreModule() {
  vi.resetModules()
  const { setSecretStore } = await import('../../shared/secret-store')
  setSecretStore({
    ...safeStorageMock,
    describeProtectionGap: () => null
  })
  vi.doMock('os', async () => {
    const actual = await vi.importActual<typeof Os>('os')
    return { ...actual, homedir: () => tempHome }
  })
  return import('./translate-ai-api-key-store')
}

beforeEach(() => {
  tempHome = mkdtempLike('orca-translate-ai-key-store-')
  safeStorageMock.decryptString.mockClear()
  safeStorageMock.encryptString.mockClear()
  safeStorageMock.isEncryptionAvailable.mockClear()
  safeStorageMock.isEncryptionAvailable.mockReturnValue(true)
})

function mkdtempLike(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function writeStoredTranslateAiKey(value: string): void {
  const orcaDir = join(tempHome, '.orca')
  mkdirSync(orcaDir, { recursive: true })
  writeFileSync(join(orcaDir, 'translate-ai-api-key.enc'), value)
}

describe('Translate AI API key store', () => {
  it('checks configured status without decrypting or touching safeStorage', async () => {
    writeStoredTranslateAiKey('encrypted-key')
    const store = await loadStoreModule()

    expect(store.hasTranslateAiApiKey()).toBe(true)
    expect(safeStorageMock.isEncryptionAvailable).not.toHaveBeenCalled()
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled()
  })

  it('decrypts only when the key is read for an API request', async () => {
    writeStoredTranslateAiKey('encrypted-key')
    const store = await loadStoreModule()

    expect(store.readTranslateAiApiKey()).toBe('encrypted-key')
    expect(safeStorageMock.decryptString).toHaveBeenCalledOnce()
  })

  it('caches the decrypted key so repeated reads do not repeatedly touch safeStorage', async () => {
    writeStoredTranslateAiKey('encrypted-key')
    const store = await loadStoreModule()

    expect(store.readTranslateAiApiKey()).toBe('encrypted-key')
    expect(store.readTranslateAiApiKey()).toBe('encrypted-key')
    expect(safeStorageMock.decryptString).toHaveBeenCalledOnce()
  })

  it('uses the in-memory key after save without decrypting from safeStorage', async () => {
    const store = await loadStoreModule()

    store.saveTranslateAiApiKey('saved-key')

    expect(store.readTranslateAiApiKey()).toBe('saved-key')
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled()
  })

  it('reports missing status without creating storage files', async () => {
    const store = await loadStoreModule()

    expect(store.hasTranslateAiApiKey()).toBe(false)
    expect(existsSync(join(tempHome, '.orca'))).toBe(false)
    expect(safeStorageMock.decryptString).not.toHaveBeenCalled()
  })

  it('clears the stored key so has reports false afterward', async () => {
    const store = await loadStoreModule()

    store.saveTranslateAiApiKey('saved-key')
    expect(store.hasTranslateAiApiKey()).toBe(true)

    store.clearTranslateAiApiKey()

    expect(store.hasTranslateAiApiKey()).toBe(false)
    expect(existsSync(join(tempHome, '.orca', 'translate-ai-api-key.enc'))).toBe(false)
  })

  it('rejects empty API keys on save', async () => {
    const store = await loadStoreModule()

    expect(() => store.saveTranslateAiApiKey('')).toThrow('Translate AI API key is required')
    expect(() => store.saveTranslateAiApiKey('   ')).toThrow('Translate AI API key is required')
  })
})
