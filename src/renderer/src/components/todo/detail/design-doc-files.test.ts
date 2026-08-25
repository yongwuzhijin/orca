import { describe, expect, it } from 'vitest'
import { designDocDirAbsolutePath, filterDesignDocNames } from './design-doc-files'

describe('designDocDirAbsolutePath', () => {
  it('joins with the platform separator of the cwd', () => {
    expect(designDocDirAbsolutePath('/home/me/repo', 'ORCA-12')).toBe(
      '/home/me/repo/.orca/design/ORCA-12'
    )
    expect(designDocDirAbsolutePath('C:\\src\\repo', 'ORCA-12')).toBe(
      'C:\\src\\repo\\.orca\\design\\ORCA-12'
    )
  })
})

describe('filterDesignDocNames', () => {
  it('keeps markdown files only, sorted, ignoring directories', () => {
    expect(
      filterDesignDocNames([
        { name: 'nested', isDirectory: true, isSymlink: false },
        { name: 'overview.md', isDirectory: false, isSymlink: false },
        { name: 'notes.txt', isDirectory: false, isSymlink: false },
        { name: 'API.MD', isDirectory: false, isSymlink: false }
      ])
    ).toEqual(['API.MD', 'overview.md'])
  })

  it('returns an empty list for an empty directory', () => {
    expect(filterDesignDocNames([])).toEqual([])
  })
})
