import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cursorProjectDirFromAgentTranscriptPath,
  extractWorkingDirectoryFromCursorRecord,
  readCursorProjectWorkspacePathSync,
  resolveCursorSessionCwdFromPath
} from './cursor-project-workspace-path'

let tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('cursorProjectDirFromAgentTranscriptPath', () => {
  it('resolves flat agent-transcripts layout', () => {
    expect(
      cursorProjectDirFromAgentTranscriptPath(
        '/Users/ada/.cursor/projects/Users-ada-orca/agent-transcripts/session.jsonl'
      )
    ).toBe('/Users/ada/.cursor/projects/Users-ada-orca')
  })

  it('resolves nested session directory layout', () => {
    expect(
      cursorProjectDirFromAgentTranscriptPath(
        '/Users/ada/.cursor/projects/Users-ada-orca/agent-transcripts/session-id/session-id.jsonl'
      )
    ).toBe('/Users/ada/.cursor/projects/Users-ada-orca')
  })

  it('returns null for unrelated paths', () => {
    expect(cursorProjectDirFromAgentTranscriptPath('/tmp/other/session.jsonl')).toBeNull()
  })
})

describe('readCursorProjectWorkspacePathSync', () => {
  it('reads workspacePath from .workspace-trusted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-cursor-project-'))
    tempDirs.push(root)
    await writeFile(join(root, '.workspace-trusted'), JSON.stringify({ workspacePath: '/tmp/ws' }))
    expect(readCursorProjectWorkspacePathSync(root)).toBe('/tmp/ws')
  })

  it('returns null when the trust file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-cursor-project-'))
    tempDirs.push(root)
    expect(readCursorProjectWorkspacePathSync(root)).toBeNull()
  })
})

describe('resolveCursorSessionCwdFromPath', () => {
  it('combines project dir lookup with workspace-trusted read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-cursor-project-'))
    tempDirs.push(root)
    const projectDir = join(root, 'Users-ada-orca')
    const transcriptPath = join(projectDir, 'agent-transcripts', 'session-id', 'session-id.jsonl')
    await mkdir(join(projectDir, 'agent-transcripts', 'session-id'), { recursive: true })
    await writeFile(
      join(projectDir, '.workspace-trusted'),
      JSON.stringify({ workspacePath: '/Users/ada/Downloads/symphony-main 2' })
    )
    await writeFile(transcriptPath, '')

    expect(resolveCursorSessionCwdFromPath(transcriptPath)).toBe(
      '/Users/ada/Downloads/symphony-main 2'
    )
  })
})

describe('extractWorkingDirectoryFromCursorRecord', () => {
  it('reads working_directory from tool_use blocks', () => {
    expect(
      extractWorkingDirectoryFromCursorRecord({
        role: 'assistant',
        message: {
          content: [{ type: 'tool_use', input: { working_directory: '/tmp/cursor-run' } }]
        }
      })
    ).toBe('/tmp/cursor-run')
  })

  it('returns null when no tool_use cwd is present', () => {
    expect(
      extractWorkingDirectoryFromCursorRecord({
        role: 'user',
        message: { content: [{ type: 'text', text: 'hi' }] }
      })
    ).toBeNull()
  })
})
