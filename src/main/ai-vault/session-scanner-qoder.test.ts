import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanAiVaultSessions } from './session-scanner'
import { isolatedScanRoots, jsonLines } from './session-scanner-test-fixtures'

const SESSION_ID = 'a960c877-c6d9-42a8-81e6-4d2854539531'
const CWD = '/work/repo'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

function transcriptLines(cwd: string): string {
  return jsonLines([
    { type: 'workspace-directories', sessionId: SESSION_ID, directories: [cwd] },
    {
      type: 'user',
      uuid: '435de0d4-d519-42af-88e1-48371e1c724d',
      timestamp: '2026-08-25T02:14:32.252Z',
      message: { role: 'user', content: 'say OK' },
      parentUuid: null,
      isSidechain: false,
      cwd,
      sessionId: SESSION_ID,
      version: '1.1.3',
      gitBranch: 'main'
    },
    {
      type: 'assistant',
      uuid: '10034698-58a0-43a7-aee4-a7653bbfb617',
      timestamp: '2026-08-25T02:14:36.757Z',
      message: {
        id: '20260825101433ae142e3fcfea478e',
        type: 'message',
        role: 'assistant',
        model: 'auto',
        content: [{ type: 'text', text: 'OK' }]
      },
      parentUuid: '435de0d4-d519-42af-88e1-48371e1c724d',
      isSidechain: false,
      cwd,
      sessionId: SESSION_ID,
      version: '1.1.3',
      gitBranch: 'main'
    },
    { type: 'last-prompt', sessionId: SESSION_ID, lastPrompt: 'say OK' }
  ])
}

/** Seeds the Qoder root that `isolatedScanRoots` points the scan at, so every
 *  other agent root stays empty and the developer's real ~/.qoder is unreachable. */
async function seedQoderProjects(): Promise<ReturnType<typeof isolatedScanRoots>> {
  const root = await mkdtemp(join(tmpdir(), 'orca-qoder-vault-'))
  tempRoots.push(root)
  const roots = isolatedScanRoots(root)
  const slugDir = join(roots.qoderProjectsDir, '-work-repo')
  await mkdir(slugDir, { recursive: true })
  await writeFile(join(slugDir, `${SESSION_ID}.jsonl`), transcriptLines(CWD), 'utf-8')
  // A bare <uuid>/state.json dir and a transcript/ dir coexist with the .jsonl
  // on real installs; neither is a session.
  const stateDir = join(slugDir, '6217ebae-c5f8-4511-a217-e69c1da35f2f')
  await mkdir(stateDir, { recursive: true })
  await writeFile(join(stateDir, 'state.json'), '{}', 'utf-8')
  await mkdir(join(slugDir, 'transcript'), { recursive: true })
  return roots
}

describe('AI Vault Qoder session scan', () => {
  it('discovers a Qoder transcript and labels it as the qoder agent', async () => {
    const result = await scanAiVaultSessions({ ...(await seedQoderProjects()) })
    const sessions = result.sessions.filter((session) => session.agent === 'qoder')
    expect(sessions).toHaveLength(1)
    expect(sessions[0].sessionId).toBe(SESSION_ID)
    expect(sessions[0].messageCount).toBe(2)
  })

  it('records the transcript cwd so the session maps to its workspace', async () => {
    const result = await scanAiVaultSessions({ ...(await seedQoderProjects()) })
    const session = result.sessions.find((entry) => entry.agent === 'qoder')
    expect(session?.cwd).toBe(CWD)
  })

  it('does not mislabel the Qoder transcript as a Claude session', async () => {
    const result = await scanAiVaultSessions({ ...(await seedQoderProjects()) })
    expect(result.sessions.some((session) => session.agent === 'claude')).toBe(false)
  })
})
