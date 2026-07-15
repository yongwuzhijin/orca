import { describe, it, expect } from 'vitest'
import { parseAutoPilotVerdict, composeContinuation } from './autopilot-verdict'

describe('parseAutoPilotVerdict', () => {
  it('parses COMPLETE sentinel', () => {
    expect(parseAutoPilotVerdict('done.\nAUTOPILOT: COMPLETE')).toEqual({
      status: 'complete',
      remaining: null
    })
  })

  it('parses CONTINUE with remaining after em dash', () => {
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE — write tests')).toEqual({
      status: 'continue',
      remaining: 'write tests'
    })
  })

  it('parses CONTINUE with hyphen or colon separators', () => {
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE - more').remaining).toBe('more')
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE: more').remaining).toBe('more')
  })

  it('parses bare CONTINUE with no remaining', () => {
    expect(parseAutoPilotVerdict('AUTOPILOT: CONTINUE')).toEqual({
      status: 'continue',
      remaining: null
    })
  })

  it('treats missing sentinel as continue', () => {
    expect(parseAutoPilotVerdict('just some text, no sentinel')).toEqual({
      status: 'continue',
      remaining: null
    })
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(parseAutoPilotVerdict('  autopilot: complete  ').status).toBe('complete')
  })

  it('uses the last sentinel line when multiple appear', () => {
    const text = 'AUTOPILOT: CONTINUE — early\nmore work\nAUTOPILOT: COMPLETE'
    expect(parseAutoPilotVerdict(text).status).toBe('complete')
  })
})

describe('composeContinuation', () => {
  it('includes remaining when provided', () => {
    expect(composeContinuation('write tests')).toContain('write tests')
  })

  it('omits the remaining clause when null', () => {
    const out = composeContinuation(null)
    expect(out).toContain('AUTOPILOT: COMPLETE')
    expect(out).not.toContain('null')
  })
})
