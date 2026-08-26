import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ORCA_DIR_NAME,
  resolveWorkspaceOrcaDirName,
  sanitizeHomeOrcaDirName,
  sanitizeWorkspaceOrcaDirName
} from './orca-dir-names'

describe('sanitizeHomeOrcaDirName', () => {
  it('accepts a plain dotted segment', () => {
    expect(sanitizeHomeOrcaDirName('.orca')).toBe('.orca')
    expect(sanitizeHomeOrcaDirName('orca-state')).toBe('orca-state')
  })

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['leading whitespace', ' .orca'],
    ['trailing whitespace', '.orca '],
    ['dot', '.'],
    ['dot dot', '..'],
    ['git', '.git'],
    ['NUL', '.or\u0000ca'],
    ['posix absolute', '/tmp/orca'],
    ['windows drive letter', 'C:\\orca'],
    ['windows separator', 'a\\b'],
    ['posix separator', 'a/b'],
    ['over 64 chars', 'o'.repeat(65)],
    ['reserved CON', 'CON'],
    ['reserved nul lowercase', 'nul'],
    ['reserved COM9', 'COM9'],
    ['reserved LPT1', 'LPT1'],
    ['double quote', '.or"ca'],
    ['single quote', ".or'ca"],
    ['dollar', '.or$ca'],
    ['backtick', '.or`ca'],
    ['semicolon', '.or;ca'],
    ['ampersand', '.or&ca'],
    ['pipe', '.or|ca'],
    ['less than', '.or<ca'],
    ['greater than', '.or>ca'],
    ['open paren', '.or(ca'],
    ['close paren', '.or)ca'],
    ['newline', '.or\nca'],
    ['space', '.or ca']
  ])('rejects %s', (_label, value) => {
    expect(sanitizeHomeOrcaDirName(value)).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(sanitizeHomeOrcaDirName(undefined)).toBeNull()
    expect(sanitizeHomeOrcaDirName(42)).toBeNull()
  })
})

describe('sanitizeWorkspaceOrcaDirName', () => {
  it('accepts a single segment', () => {
    expect(sanitizeWorkspaceOrcaDirName('.orca')).toBe('.orca')
  })

  it('accepts multiple posix segments', () => {
    expect(sanitizeWorkspaceOrcaDirName('.tmp/orca')).toBe('.tmp/orca')
  })

  it('validates every segment, not just the first', () => {
    expect(sanitizeWorkspaceOrcaDirName('.tmp/..')).toBeNull()
    expect(sanitizeWorkspaceOrcaDirName('.tmp/.git')).toBeNull()
    expect(sanitizeWorkspaceOrcaDirName('.tmp/or$ca')).toBeNull()
  })

  it('rejects empty segments from leading, trailing, or doubled separators', () => {
    expect(sanitizeWorkspaceOrcaDirName('/orca')).toBeNull()
    expect(sanitizeWorkspaceOrcaDirName('.orca/')).toBeNull()
    expect(sanitizeWorkspaceOrcaDirName('.tmp//orca')).toBeNull()
  })

  it('rejects windows separators', () => {
    expect(sanitizeWorkspaceOrcaDirName('.tmp\\orca')).toBeNull()
  })
})

describe('resolvers', () => {
  it('falls back to the default for undefined settings', () => {
    expect(resolveWorkspaceOrcaDirName(undefined)).toBe(DEFAULT_ORCA_DIR_NAME)
    expect(resolveWorkspaceOrcaDirName(null)).toBe(DEFAULT_ORCA_DIR_NAME)
    expect(resolveWorkspaceOrcaDirName({})).toBe(DEFAULT_ORCA_DIR_NAME)
  })

  it('falls back to the default for a hand-edited invalid value', () => {
    expect(resolveWorkspaceOrcaDirName({ workspaceOrcaDirName: '../escape' })).toBe(
      DEFAULT_ORCA_DIR_NAME
    )
    expect(resolveWorkspaceOrcaDirName({ workspaceOrcaDirName: '$(rm -rf ~)' })).toBe(
      DEFAULT_ORCA_DIR_NAME
    )
  })

  it('returns the configured value when valid', () => {
    expect(resolveWorkspaceOrcaDirName({ workspaceOrcaDirName: '.tmp/orca' })).toBe('.tmp/orca')
    expect(resolveWorkspaceOrcaDirName({ workspaceOrcaDirName: '.scratch' })).toBe('.scratch')
  })
})
