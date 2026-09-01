import { stat } from 'node:fs/promises'
import { resolveCliCommand } from '../../shared/node-cli-command-resolution'
import { runProcessSync } from '../../shared/child-process/run-process'

const READ_FILE_SCRIPT = String.raw`
const fs = require('node:fs');
const path = process.argv[1];
const encoding = process.argv[2];
process.stdout.write(fs.readFileSync(path, encoding));
`

const READ_SLICE_SCRIPT = String.raw`
const fs = require('node:fs');
const path = process.argv[1];
const start = Number(process.argv[2]);
const len = Number(process.argv[3]);
const fd = fs.openSync(path, 'r');
try {
  const buf = Buffer.alloc(len);
  const n = fs.readSync(fd, buf, 0, len, start);
  process.stdout.write(buf.subarray(0, n).toString('base64'));
} finally {
  fs.closeSync(fd);
}
`

export type MacosQoderTranscriptHandle = {
  readonly macosQoderTranscriptHandle: true
  readonly path: string
}

export function isMacosQoderTranscriptHandle(value: object): value is MacosQoderTranscriptHandle {
  return 'macosQoderTranscriptHandle' in value
}

export function createMacosQoderTranscriptHandle(path: string): MacosQoderTranscriptHandle {
  return { macosQoderTranscriptHandle: true, path }
}

function plainNodeProgram(): string {
  return resolveCliCommand('node')
}

function assertPlainNodeReadSucceeded(
  path: string,
  result: ReturnType<typeof runProcessSync>
): void {
  if (result.timedOut) {
    throw new Error(`Timed out reading Qoder transcript: ${path}`)
  }
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`
    throw new Error(`Failed to read Qoder transcript ${path}: ${detail}`)
  }
}

export async function readMacosQoderTranscriptFile(
  path: string,
  encoding: BufferEncoding
): Promise<string> {
  const fileStat = await stat(path)
  const result = runProcessSync({
    program: plainNodeProgram(),
    args: ['-e', READ_FILE_SCRIPT, path, encoding],
    maxOutputBytes: Math.max(fileStat.size + 1024, 1024),
    timeoutMs: 60_000
  })
  assertPlainNodeReadSucceeded(path, result)
  return result.stdout
}

export async function readMacosQoderTranscriptSlice(
  path: string,
  position: number,
  length: number
): Promise<Buffer> {
  const result = runProcessSync({
    program: plainNodeProgram(),
    args: ['-e', READ_SLICE_SCRIPT, path, String(position), String(length)],
    maxOutputBytes: Math.ceil((length * 4) / 3) + 256,
    timeoutMs: 60_000
  })
  assertPlainNodeReadSucceeded(path, result)
  const encoded = result.stdout.trim()
  return encoded.length > 0 ? Buffer.from(encoded, 'base64') : Buffer.alloc(0)
}
