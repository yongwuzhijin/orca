import { describe, expect, it } from 'vitest'
import { getRemoteHostPlatform } from '../ssh/ssh-remote-platform'
import { scanRemoteAiVaultSessions } from './remote-session-scanner'
import { MemoryRemoteProvider, jsonLines } from './remote-session-scanner-test-fixtures'

function codexTranscript(args: {
  sessionId: string
  title: string
  cwd: string
  timestamp: string
  threadSource?: string
}): string {
  return jsonLines([
    {
      timestamp: args.timestamp,
      type: 'session_meta',
      payload: {
        id: args.sessionId,
        cwd: args.cwd,
        ...(args.threadSource ? { thread_source: args.threadSource } : {})
      }
    },
    {
      timestamp: args.timestamp.replace(':00.000Z', ':01.000Z'),
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: args.title }]
      }
    }
  ])
}

describe('scanRemoteAiVaultSessions scoped backfill', () => {
  it('keeps looking past newer out-of-scope candidates during scoped backfill', async () => {
    const provider = new MemoryRemoteProvider()
    for (const [sessionId, mtimeMs, hour] of [
      ['other-newest', 50, '05'],
      ['other-newer', 40, '04']
    ] as const) {
      provider.addFile(
        `/home/ada/.codex/sessions/${sessionId}.jsonl`,
        codexTranscript({
          sessionId,
          title: sessionId,
          cwd: '/home/ada/other',
          timestamp: `2026-07-04T${hour}:00:00.000Z`
        }),
        mtimeMs
      )
    }
    provider.addFile(
      '/home/ada/.codex/sessions/scoped.jsonl',
      codexTranscript({
        sessionId: 'scoped-session',
        title: 'Scoped workspace',
        cwd: '/home/ada/repo',
        timestamp: '2026-07-04T01:00:00.000Z'
      }),
      10
    )

    const result = await scanRemoteAiVaultSessions({
      provider,
      executionHostId: 'ssh:dev-box',
      remoteHome: '/home/ada',
      hostPlatform: getRemoteHostPlatform('linux-x64'),
      limit: 1,
      scopePaths: ['/home/ada/repo']
    })

    expect(result.issues).toEqual([])
    expect(result.sessions.map((session) => session.sessionId)).toEqual([
      'other-newest',
      'scoped-session'
    ])
  })

  it('caps scoped backfill at the requested limit', async () => {
    const provider = new MemoryRemoteProvider()
    provider.addFile(
      '/home/ada/.codex/sessions/other.jsonl',
      codexTranscript({
        sessionId: 'other-session',
        title: 'Other workspace',
        cwd: '/home/ada/other',
        timestamp: '2026-07-04T05:00:00.000Z'
      }),
      50
    )
    for (const [sessionId, mtimeMs] of [
      ['newer-scoped', 30],
      ['older-scoped', 20]
    ] as const) {
      provider.addFile(
        `/home/ada/.codex/sessions/${sessionId}.jsonl`,
        codexTranscript({
          sessionId,
          title: sessionId,
          cwd: '/home/ada/repo',
          timestamp: `2026-07-04T0${mtimeMs / 10}:00:00.000Z`
        }),
        mtimeMs
      )
    }

    const result = await scanRemoteAiVaultSessions({
      provider,
      executionHostId: 'ssh:dev-box',
      remoteHome: '/home/ada',
      hostPlatform: getRemoteHostPlatform('linux-x64'),
      limit: 1,
      scopePaths: ['/home/ada/repo']
    })

    expect(result.sessions.map((session) => session.sessionId)).toEqual([
      'other-session',
      'newer-scoped'
    ])
  })
})
