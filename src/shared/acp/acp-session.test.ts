import { describe, expect, it } from 'vitest'
import { ACP_ENGINES, isAcpEngine } from './acp-session'

describe('acp-session shared types', () => {
  it('lists claude, qoder and cursor as the ACP engines', () => {
    expect([...ACP_ENGINES]).toEqual(['claude', 'qoder', 'cursor'])
  })

  it('isAcpEngine narrows known engines and rejects others', () => {
    expect(isAcpEngine('claude')).toBe(true)
    expect(isAcpEngine('qoder')).toBe(true)
    expect(isAcpEngine('')).toBe(false)
  })
})

describe('cursor engine (P2b)', () => {
  it('includes cursor in ACP_ENGINES', () => {
    expect(ACP_ENGINES).toContain('cursor')
  })

  it('isAcpEngine recognizes cursor', () => {
    expect(isAcpEngine('cursor')).toBe(true)
  })
})
