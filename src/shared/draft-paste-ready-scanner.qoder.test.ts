import { describe, expect, it } from 'vitest'
import { createDraftPasteReadyScanner } from './draft-paste-ready-scanner'

const BRACKETED_PASTE = '\x1b[?2004h'
const PLACEHOLDER = '@path/to/file'

describe('qoder-composer-prompt draft paste readiness', () => {
  it('is not ready on the bracketed-paste enable alone', () => {
    const scanner = createDraftPasteReadyScanner('qoder-composer-prompt')
    const result = scanner.observe(BRACKETED_PASTE)
    expect(result.ready).toBe(false)
  })

  it('is ready when the composer placeholder renders after bracketed paste', () => {
    const scanner = createDraftPasteReadyScanner('qoder-composer-prompt')
    scanner.observe(BRACKETED_PASTE)
    expect(scanner.observe(`Type\x1b[39m your message ${PLACEHOLDER}`).ready).toBe(true)
  })

  it('ignores the placeholder when it precedes bracketed paste', () => {
    const scanner = createDraftPasteReadyScanner('qoder-composer-prompt')
    expect(scanner.observe(`${PLACEHOLDER} shell prompt echo`).ready).toBe(false)
  })

  it('rejoins a placeholder split across chunks', () => {
    const scanner = createDraftPasteReadyScanner('qoder-composer-prompt')
    scanner.observe(BRACKETED_PASTE)
    expect(scanner.observe('@path/to').ready).toBe(false)
    expect(scanner.observe('/file').ready).toBe(true)
  })

  it('arms the quiet-window fallback so a placeholder-less build still delivers', () => {
    const scanner = createDraftPasteReadyScanner('qoder-composer-prompt')
    expect(scanner.observe(BRACKETED_PASTE).armQuietTimer).toBe(true)
  })
})
