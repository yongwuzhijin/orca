import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

// Why: verify the mock agent speaks ACP well enough for later integration tests.
describe('mock-acp-agent smoke', () => {
  it('responds to initialize over stdio', async () => {
    const script = join(process.cwd(), 'tests', 'mock-acp-agent.mjs')
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'inherit']
    })
    const req = `${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: 1, clientCapabilities: {} }
    })}\n`
    child.stdin.write(req)
    const line = await new Promise<string>((resolve, reject) => {
      let buf = ''
      const timer = setTimeout(() => reject(new Error('timeout')), 5000)
      child.stdout.on('data', (d) => {
        buf += d.toString()
        const nl = buf.indexOf('\n')
        if (nl >= 0) {
          clearTimeout(timer)
          resolve(buf.slice(0, nl))
        }
      })
    })
    child.kill()
    const msg = JSON.parse(line)
    expect(msg.id).toBe(1)
    expect(msg.result).toBeTruthy()
    expect(msg.result.protocolVersion).toBeDefined()
  })
})
