import { getSecretStore } from '../../shared/secret-store'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { orcaHomeDir } from '../orca-home-dir-path'

type StoredTranslateAiKey = {
  encryptedKeyBase64: string
}

const TRANSLATE_AI_KEY_FILE = 'translate-ai-api-key.enc'
let cachedTranslateAiApiKey: string | null = null

function getOrcaDir(): string {
  return orcaHomeDir()
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function getTranslateAiKeyPath(): string {
  return join(getOrcaDir(), TRANSLATE_AI_KEY_FILE)
}

function readLegacyJsonStoredKey(): StoredTranslateAiKey | null {
  const keyPath = getTranslateAiKeyPath()
  if (!existsSync(keyPath)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(keyPath, 'utf8')) as Partial<StoredTranslateAiKey>
    if (typeof parsed.encryptedKeyBase64 !== 'string' || parsed.encryptedKeyBase64 === '') {
      return null
    }
    return { encryptedKeyBase64: parsed.encryptedKeyBase64 }
  } catch {
    return null
  }
}

export function hasTranslateAiApiKey(): boolean {
  return existsSync(getTranslateAiKeyPath())
}

export function saveTranslateAiApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    throw new Error('Translate AI API key is required')
  }
  ensureOrcaDir()
  if (getSecretStore().isEncryptionAvailable()) {
    writeFileSync(getTranslateAiKeyPath(), getSecretStore().encryptString(trimmed), { mode: 0o600 })
    cachedTranslateAiApiKey = trimmed
    return
  }

  console.warn(
    '[text-translation] secret encryption unavailable — storing translate AI key in plaintext'
  )
  writeFileSync(getTranslateAiKeyPath(), trimmed, { encoding: 'utf8', mode: 0o600 })
  cachedTranslateAiApiKey = trimmed
}

export function readTranslateAiApiKey(): string {
  if (cachedTranslateAiApiKey !== null) {
    return cachedTranslateAiApiKey
  }

  const keyPath = getTranslateAiKeyPath()
  if (!existsSync(keyPath)) {
    throw new Error('Translate AI API key is not configured')
  }
  try {
    const raw = readFileSync(keyPath)
    const legacyJson = readLegacyJsonStoredKey()
    if (legacyJson) {
      cachedTranslateAiApiKey = getSecretStore().decryptString(
        Buffer.from(legacyJson.encryptedKeyBase64, 'base64')
      )
      return cachedTranslateAiApiKey
    }
    cachedTranslateAiApiKey = getSecretStore().isEncryptionAvailable()
      ? getSecretStore().decryptString(raw)
      : raw.toString('utf8')
    return cachedTranslateAiApiKey
  } catch {
    throw new Error('Translate AI API key could not be decrypted')
  }
}

export function clearTranslateAiApiKey(): void {
  cachedTranslateAiApiKey = null
  rmSync(getTranslateAiKeyPath(), { force: true })
}
