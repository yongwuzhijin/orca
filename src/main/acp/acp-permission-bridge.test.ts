import { describe, it, expect, vi } from 'vitest'
import { AcpPermissionBridge } from './acp-permission-bridge'

const allowOpt = { optionId: 'allow', name: 'Allow', kind: 'allow_once' as const }
const denyOpt = { optionId: 'deny', name: 'Deny', kind: 'reject_once' as const }

describe('AcpPermissionBridge', () => {
  it('auto-allows by default and broadcasts the request', async () => {
    const broadcast = vi.fn()
    const bridge = new AcpPermissionBridge(broadcast)
    const outcome = await bridge.requestPermission('sess-1', {
      options: [allowOpt, denyOpt],
      toolCall: { toolCallId: 't1', title: 'x' }
    })
    expect(outcome).toEqual({ outcome: 'selected', optionId: 'allow' })
    expect(broadcast).toHaveBeenCalledWith(
      'acp:permission-request',
      expect.objectContaining({ sessionId: 'sess-1' }),
      'sess-1'
    )
  })

  it('resolvePermission overrides the pending request before auto-allow', async () => {
    let capturedRequestId = ''
    const broadcast = vi.fn((_c: string, payload: unknown) => {
      capturedRequestId = (payload as { requestId: string }).requestId
    })
    const b2 = new AcpPermissionBridge(broadcast, { autoAllow: false })
    const p = b2.requestPermission('sess-2', {
      options: [allowOpt, denyOpt],
      toolCall: { toolCallId: 't', title: 'y' }
    })
    expect(capturedRequestId).not.toBe('')
    b2.resolvePermission(capturedRequestId, 'deny')
    await expect(p).resolves.toEqual({ outcome: 'selected', optionId: 'deny' })
  })

  it('rejectAllForSession resolves pending with cancelled', async () => {
    let reqId = ''
    const b = new AcpPermissionBridge(
      (_c: string, p: unknown) => {
        reqId = (p as { requestId: string }).requestId
      },
      { autoAllow: false }
    )
    const pending = b.requestPermission('sess-3', {
      options: [allowOpt],
      toolCall: { toolCallId: 't', title: 'z' }
    })
    b.rejectAllForSession('sess-3')
    await expect(pending).resolves.toEqual({ outcome: 'cancelled' })
    void reqId
  })
})
