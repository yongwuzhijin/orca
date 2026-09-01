import { describe, expect, it } from 'vitest'
import {
  isMacosQoderTranscriptPath,
  macosQoderProjectsRoot,
  macosQoderTranscriptAgentOverride
} from './macos-qoder-transcript-paths'

describe('macos qoder transcript paths', () => {
  it('matches jsonl files under ~/.qoder/projects on darwin', () => {
    const home = '/Users/ada'
    const root = macosQoderProjectsRoot(home)
    expect(isMacosQoderTranscriptPath(`${root}/-repo/session.jsonl`, 'darwin', home)).toBe(true)
    expect(isMacosQoderTranscriptPath(`${root}/-repo/transcript/uuid.jsonl`, 'darwin', home)).toBe(
      true
    )
  })

  it('ignores non-jsonl and paths outside the qoder projects root', () => {
    const home = '/Users/ada'
    const root = macosQoderProjectsRoot(home)
    expect(isMacosQoderTranscriptPath(`${root}/settings.json`, 'darwin', home)).toBe(false)
    expect(isMacosQoderTranscriptPath('/Users/ada/.claude/projects/x.jsonl', 'darwin', home)).toBe(
      false
    )
    expect(isMacosQoderTranscriptPath(`${root}/session.jsonl`, 'linux', home)).toBe(false)
  })

  it('forces qoder agent labels for qoder transcript paths on darwin', () => {
    const home = '/Users/ada'
    const root = macosQoderProjectsRoot(home)
    expect(macosQoderTranscriptAgentOverride(`${root}/-repo/session.jsonl`, 'darwin', home)).toBe(
      'qoder'
    )
    expect(
      macosQoderTranscriptAgentOverride('/Users/ada/.claude/projects/x.jsonl', 'darwin', home)
    ).toBe(null)
  })
})
