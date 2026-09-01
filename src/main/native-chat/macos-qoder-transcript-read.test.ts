import type * as NodeFsPromisesModule from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runProcessSync: vi.fn(),
  stat: vi.fn(),
  resolveCliCommand: vi.fn(() => '/usr/local/bin/node')
}))

vi.mock('../../shared/child-process/run-process', () => ({
  runProcessSync: mocks.runProcessSync
}))

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof NodeFsPromisesModule>()),
  stat: mocks.stat
}))

vi.mock('../../shared/node-cli-command-resolution', () => ({
  resolveCliCommand: mocks.resolveCliCommand
}))

import {
  createMacosQoderTranscriptHandle,
  isMacosQoderTranscriptHandle,
  readMacosQoderTranscriptFile,
  readMacosQoderTranscriptSlice
} from './macos-qoder-transcript-read'

beforeEach(() => {
  mocks.runProcessSync.mockReset()
  mocks.stat.mockReset()
  mocks.stat.mockResolvedValue({ size: 128 })
})

describe('macos qoder transcript read via plain node', () => {
  it('reads a whole file through plain node spawn', async () => {
    mocks.runProcessSync.mockReturnValue({
      code: 0,
      signal: null,
      stdout: '{"type":"user"}\n',
      stderr: '',
      timedOut: false
    })

    await expect(
      readMacosQoderTranscriptFile('/Users/ada/.qoder/projects/x/a.jsonl', 'utf-8')
    ).resolves.toBe('{"type":"user"}\n')

    expect(mocks.runProcessSync).toHaveBeenCalledWith(
      expect.objectContaining({
        program: '/usr/local/bin/node',
        args: expect.arrayContaining([
          '-e',
          expect.any(String),
          '/Users/ada/.qoder/projects/x/a.jsonl',
          'utf-8'
        ])
      })
    )
  })

  it('reads a byte slice as base64 from plain node stdout', async () => {
    mocks.runProcessSync.mockReturnValue({
      code: 0,
      signal: null,
      stdout: Buffer.from('hello').toString('base64'),
      stderr: '',
      timedOut: false
    })

    await expect(
      readMacosQoderTranscriptSlice('/Users/ada/.qoder/projects/x/a.jsonl', 10, 5)
    ).resolves.toEqual(Buffer.from('hello'))

    expect(mocks.runProcessSync).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['-e', expect.any(String), '/Users/ada/.qoder/projects/x/a.jsonl', '10', '5']
      })
    )
  })

  it('identifies macos qoder transcript handles', () => {
    const handle = createMacosQoderTranscriptHandle('/tmp/a.jsonl')
    expect(isMacosQoderTranscriptHandle(handle)).toBe(true)
    expect(isMacosQoderTranscriptHandle({ wslTranscriptFsProcessHandle: true })).toBe(false)
  })
})
