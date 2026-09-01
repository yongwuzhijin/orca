import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scanAiVaultSessions } from './session-scanner'
import { isolatedScanRoots, jsonLines } from './session-scanner-test-fixtures'

let tempRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

describe('scanAiVaultSessions grok title envelopes', () => {
  it('strips newline-heavy Grok user_query envelopes without regex matching', async () => {
    const matchSpy = vi.spyOn(String.prototype, 'match')
    const root = await mkdtemp(join(tmpdir(), 'orca-ai-vault-grok-large-'))
    tempRoots.push(root)
    const roots = isolatedScanRoots(root)
    const sessionDir = join(roots.grokSessionsDir, encodeURIComponent('/tmp/grok'), 'large-session')
    const requestText = 'Grok large title\n'.repeat(300)
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      join(sessionDir, 'summary.json'),
      JSON.stringify({
        info: { id: 'large-session', cwd: '/tmp/grok' },
        created_at: '2026-05-01T10:04:00.000Z'
      })
    )
    await writeFile(
      join(sessionDir, 'chat_history.jsonl'),
      jsonLines([
        {
          type: 'user',
          content: `<USER_INFO>context</USER_INFO><USER_QUERY>\n${requestText}</USER_QUERY>`
        }
      ])
    )

    const result = await scanAiVaultSessions({
      ...roots,
      platform: 'darwin',
      limit: 5
    })

    expect(result.issues).toEqual([])
    expect(result.sessions[0]?.title).toContain('Grok large title')
    expect(result.sessions[0]?.title).not.toContain('USER_QUERY')
    const usedGrokWrapperMatch = matchSpy.mock.calls.some(
      ([pattern]) =>
        pattern instanceof RegExp &&
        pattern.source.includes('<user_query>') &&
        pattern.source.includes('[\\s\\S]')
    )
    expect(usedGrokWrapperMatch).toBe(false)
  })
})
