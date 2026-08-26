import { describe, expect, it } from 'vitest'
import { appendOrcaDirIgnore, isOrcaDirIgnored } from './orca-dir-gitignore-entry'

describe('isOrcaDirIgnored', () => {
  it('matches the bare name and the trailing-slash form', () => {
    expect(isOrcaDirIgnored('.orca\n', '.orca')).toBe(true)
    expect(isOrcaDirIgnored('.orca/\n', '.orca')).toBe(true)
  })

  it('matches a line in the middle of the file', () => {
    expect(isOrcaDirIgnored('node_modules\n.orca\ndist\n', '.orca')).toBe(true)
  })

  it('does not match a different name', () => {
    expect(isOrcaDirIgnored('.orca\n', '.tmp/orca')).toBe(false)
  })

  it('does not match a longer line that merely starts with the name', () => {
    expect(isOrcaDirIgnored('.orca-opencode\n', '.orca')).toBe(false)
  })

  it('escapes regex metacharacters in the name', () => {
    // Why: a `.` in the name must not act as a wildcard.
    expect(isOrcaDirIgnored('xorca\n', '.orca')).toBe(false)
  })

  it('matches a multi-segment name', () => {
    expect(isOrcaDirIgnored('.tmp/orca\n', '.tmp/orca')).toBe(true)
    expect(isOrcaDirIgnored('.tmp/orca/\n', '.tmp/orca')).toBe(true)
  })
})

describe('appendOrcaDirIgnore', () => {
  it('appends to an empty file without a leading blank line', () => {
    expect(appendOrcaDirIgnore('', '.orca')).toBe('.orca\n')
  })

  it('adds the missing newline before appending', () => {
    expect(appendOrcaDirIgnore('dist', '.orca')).toBe('dist\n.orca\n')
  })

  it('does not add a second newline', () => {
    expect(appendOrcaDirIgnore('dist\n', '.orca')).toBe('dist\n.orca\n')
  })

  it('is idempotent', () => {
    const once = appendOrcaDirIgnore('dist\n', '.tmp/orca')
    expect(appendOrcaDirIgnore(once, '.tmp/orca')).toBe(once)
  })

  it('does not treat a pre-existing .orca line as an ignore of a renamed directory', () => {
    expect(appendOrcaDirIgnore('.orca\n', '.tmp/orca')).toBe('.orca\n.tmp/orca\n')
  })
})
