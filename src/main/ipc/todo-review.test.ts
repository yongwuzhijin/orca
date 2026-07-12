import { describe, it, expect, vi } from 'vitest'
import { registerTodoReviewHandlers } from './todo-review'
import type { WorkspacePort } from '../../shared/workspace-ports'

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>()
  return {
    ipcMain: {
      handle: (ch: string, fn: (e: unknown, arg: unknown) => unknown) => handlers.set(ch, fn)
    },
    invoke: (ch: string, arg: unknown) => handlers.get(ch)!({}, arg),
    handlers
  }
}

describe('registerTodoReviewHandlers', () => {
  it('todos:review.scanPorts delegates to scanReviewPorts with taskId', async () => {
    const f = fakeIpc()
    const ports: WorkspacePort[] = [
      {
        id: 'p1',
        bindHost: '0.0.0.0',
        connectHost: 'localhost',
        port: 3000,
        protocol: 'http',
        kind: 'workspace',
        owner: {
          worktreeId: 't1',
          repoId: 't1',
          displayName: 't1',
          path: '/repo',
          confidence: 'cwd'
        }
      }
    ]
    const scanReviewPorts = vi.fn().mockResolvedValue(ports)
    registerTodoReviewHandlers({ scanReviewPorts }, f.ipcMain as never)
    const out = await f.invoke('todos:review.scanPorts', { taskId: 't1' })
    expect(scanReviewPorts).toHaveBeenCalledWith('t1')
    expect(out).toEqual(ports)
  })
})
