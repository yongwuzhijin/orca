import { describe, expect, it } from 'vitest'
import { appendOrcaDirIgnore, isOrcaDirIgnored } from '../../shared/orca-dir-gitignore-entry'

describe('remote .gitignore maintenance', () => {
  it('appends the configured name to an existing file', () => {
    expect(appendOrcaDirIgnore('node_modules/\n', '.tmp/orca')).toBe('node_modules/\n.tmp/orca\n')
  })

  it('creates the entry from empty content without a leading blank line', () => {
    expect(appendOrcaDirIgnore('', '.scratch')).toBe('.scratch\n')
  })

  it('adds a missing trailing newline before appending', () => {
    expect(appendOrcaDirIgnore('dist', '.scratch')).toBe('dist\n.scratch\n')
  })

  it('is idempotent for the configured name', () => {
    const once = appendOrcaDirIgnore('dist\n', '.scratch')
    expect(appendOrcaDirIgnore(once, '.scratch')).toBe(once)
  })

  it('treats a trailing-slash entry as already ignored', () => {
    expect(appendOrcaDirIgnore('.scratch/\n', '.scratch')).toBe('.scratch/\n')
  })

  it('does not treat a legacy .orca line as an ignore of the renamed directory', () => {
    expect(isOrcaDirIgnored('.orca\n', '.tmp/orca')).toBe(false)
  })
})
