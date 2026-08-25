import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testState = { fakeHomeDir: '', userDataDir: '' }

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return testState.userDataDir
      }
      throw new Error(`unexpected app.getPath(${name})`)
    }
  }
}))

vi.mock('node:os', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: () => testState.fakeHomeDir }
})

const { markQoderFolderTrusted } = await import('./agent-trust-presets')

// Why these paths must not exist: the module canonicalizes through
// realpathSync.native only when the path is present on disk, so non-existent
// paths round-trip unchanged and the assertions stay platform-neutral.
const WORKSPACE_ROOT = join(tmpdir(), 'orca-qoder-ws-root')
const WORKSPACE_REPO = join(WORKSPACE_ROOT, 'repo')

function settingsPath(): string {
  return join(testState.fakeHomeDir, '.qoder', 'settings.json')
}

function writeSettings(content: string): void {
  mkdirSync(join(testState.fakeHomeDir, '.qoder'), { recursive: true })
  writeFileSync(settingsPath(), content, 'utf-8')
}

function readSettings(): string {
  return readFileSync(settingsPath(), 'utf-8')
}

beforeEach(() => {
  testState.fakeHomeDir = mkdtempSync(join(tmpdir(), 'orca-qoder-trust-'))
  testState.userDataDir = mkdtempSync(join(tmpdir(), 'orca-qoder-trust-user-data-'))
  process.env.ORCA_USER_DATA_PATH = testState.userDataDir
  expect(existsSync(WORKSPACE_ROOT)).toBe(false)
})

describe('markQoderFolderTrusted', () => {
  it('creates settings.json with the workspace trusted', () => {
    markQoderFolderTrusted(WORKSPACE_REPO)
    expect(JSON.parse(readSettings())).toEqual({
      permissions: { trustDirectories: [WORKSPACE_REPO] }
    })
  })

  it('appends without dropping unrelated settings keys', () => {
    writeSettings(
      JSON.stringify({ mcpServers: { a: {} }, permissions: { trustDirectories: ['/other'] } })
    )
    markQoderFolderTrusted(WORKSPACE_REPO)
    const parsed = JSON.parse(readSettings())
    expect(parsed.mcpServers).toEqual({ a: {} })
    expect(parsed.permissions.trustDirectories).toEqual(['/other', WORKSPACE_REPO])
  })

  it('is idempotent for an already-trusted path', () => {
    markQoderFolderTrusted(WORKSPACE_REPO)
    markQoderFolderTrusted(WORKSPACE_REPO)
    expect(JSON.parse(readSettings()).permissions.trustDirectories).toEqual([WORKSPACE_REPO])
  })

  it('skips a workspace already covered by a trusted ancestor', () => {
    markQoderFolderTrusted(WORKSPACE_ROOT)
    markQoderFolderTrusted(WORKSPACE_REPO)
    expect(JSON.parse(readSettings()).permissions.trustDirectories).toEqual([WORKSPACE_ROOT])
  })

  it('leaves a malformed settings.json untouched rather than clobbering it', () => {
    writeSettings('{ not json')
    markQoderFolderTrusted(WORKSPACE_REPO)
    expect(readSettings()).toBe('{ not json')
  })
})
