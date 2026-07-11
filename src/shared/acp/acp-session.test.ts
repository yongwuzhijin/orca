import { describe, expect, it } from 'vitest'
import { ACP_ENGINES, isAcpEngine } from './acp-session'

describe('acp-session shared types', () => {
  it('lists claude and qoder as the P2a engines', () => {
    expect([...ACP_ENGINES]).toEqual(['claude', 'qoder'])
  })

  it('isAcpEngine narrows known engines and rejects others', () => {
    expect(isAcpEngine('claude')).toBe(true)
    expect(isAcpEngine('qoder')).toBe(true)
    expect(isAcpEngine('cursor')).toBe(false)
    expect(isAcpEngine('')).toBe(false)
  })
})
